import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { Warehouse } from '../warehouses/entities/warehouse.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserMapper } from './mappers/user.mapper';
import { PaginationQueryDto } from '../utils/query.dto';
import { paginate } from '../utils/pagination.util';
import { applySortAndSearch } from '../utils/query.util';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepository: Repository<Warehouse>,
    private readonly userMapper: UserMapper,
  ) {}

  /**
   * Create a new user with unique email and username checks.
   * If role is TENANT_OWNER and warehouseName is provided, creates a warehouse automatically.
   */
  async create(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    const emailTaken = await this.userRepository.existsBy({
      email: createUserDto.email,
    });
    if (emailTaken) {
      throw new ConflictException('Email already in use');
    }

    const usernameTaken = await this.userRepository.existsBy({
      username: createUserDto.username,
    });
    if (usernameTaken) {
      throw new ConflictException('Username already in use');
    }

    const user = this.userMapper.toEntity(createUserDto);
    let saved: User;
    try {
      saved = await this.userRepository.save(user);
    } catch (err) {
      if (err instanceof QueryFailedError && (err as any).code === '23505') {
        const detail = (err as any).detail ?? '';
        if (detail.includes('email')) {
          throw new ConflictException('Email already in use');
        }
        if (detail.includes('username')) {
          throw new ConflictException('Username already in use');
        }
      }
      throw err;
    }

    // Auto-create main warehouse for tenant_owner registration
    if (!createUserDto.warehouseId && saved.role === UserRole.TENANT_OWNER) {
      const warehouse = this.warehouseRepository.create({
        name: createUserDto.warehouseName || 'Main Warehouse',
        location: createUserDto.warehouseLocation ?? null,
        tenantId: saved.id,
        isMain: true,
      });
      const savedWarehouse = await this.warehouseRepository.save(warehouse);
      
      saved.warehouseId = savedWarehouse.id;
      saved = await this.userRepository.save(saved);
      this.logger.log(`Warehouse created for new tenant: ${savedWarehouse.id}`);
    }

    this.logger.log(`User created: ${saved.id}`);
    return this.userMapper.toResponse(saved);
  }

  /**
   * Return all users (active and inactive).
   */
  async findAll(query: PaginationQueryDto): Promise<{ data: UserResponseDto[]; total: number }> {
    const qb = this.userRepository
      .createQueryBuilder('user');
    applySortAndSearch(qb, 'user', query.sortBy, query.sortOrder, query.search, ['username', 'email', 'name']);
    const result = await paginate(qb, query.page!, query.limit!);
    return { data: this.userMapper.toResponseList(result.data), total: result.total };
  }

  /**
   * Find a single user by UUID and return a safe response DTO.
   */
  async findById(id: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    return this.userMapper.toResponse(user);
  }

  /**
   * Returns the raw User entity WITH the passwordHash field selected.
   * For AUTH USE ONLY — never expose this outside of the auth flow.
   */
  async findByEmailForAuth(email: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
  }

  /**
   * Returns the raw User entity WITH the passwordHash field selected.
   * For AUTH USE ONLY — never expose this outside of the auth flow.
   */
  async findByUsernameForAuth(username: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.username = :username', { username })
      .getOne();
  }

  async findByResetTokenForAuth(token: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .addSelect('user.resetPasswordToken')
      .addSelect('user.resetPasswordExpires')
      .where('user.resetPasswordToken = :token', { token })
      .getOne();
  }

  async saveRawUser(user: User): Promise<User> {
    return this.userRepository.save(user);
  }


  /**
   * Update a user's profile fields.
   */
  async update(id: string, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
    const existing = await this.userRepository.findOne({ where: { id }, select: ['id', 'email', 'username'] });
    if (!existing) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    const updates: Partial<User> = {};

    if (updateUserDto.email && updateUserDto.email !== existing.email) {
      const emailTaken = await this.userRepository.existsBy({ email: updateUserDto.email });
      if (emailTaken) {
        throw new ConflictException('Email already in use');
      }
      updates.email = updateUserDto.email.toLowerCase().trim();
    }

    if (updateUserDto.username && updateUserDto.username !== existing.username) {
      const usernameTaken = await this.userRepository.existsBy({ username: updateUserDto.username });
      if (usernameTaken) {
        throw new ConflictException('Username already in use');
      }
      updates.username = updateUserDto.username.trim();
    }

    if (updateUserDto.name !== undefined) {
      updates.name = updateUserDto.name?.trim() ?? '';
    }

    if (updateUserDto.warehouseId !== undefined) {
      updates.warehouseId = updateUserDto.warehouseId ?? null;
    }

    if (updateUserDto.role !== undefined) {
      updates.role = updateUserDto.role;
    }

    if (updateUserDto.isActive !== undefined) {
      updates.isActive = updateUserDto.isActive;
    }

    if (Object.keys(updates).length > 0) {
      await this.userRepository.update(id, updates);
    }

    const saved = await this.userRepository.findOne({ where: { id } });
    this.logger.log(`User updated: ${saved!.id}`);
    return this.userMapper.toResponse(saved!);
  }

  /**
   * Soft-delete a user by ID (sets deletedAt; record is preserved in DB).
   */
  async remove(id: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    await this.userRepository.softRemove(user);
    this.logger.log(`User soft-deleted: ${id}`);
  }
}
