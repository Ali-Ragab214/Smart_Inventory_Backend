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
import { Tenant } from '../tenants/entities/tenant.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
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
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly userMapper: UserMapper,
  ) {}

  /**
   * Create a new user with unique email and username checks.
   * If role is TENANT_OWNER and warehouseName is provided, creates a warehouse automatically.
   */
  async create(currentUser: UserResponseDto | null, createUserDto: CreateUserDto): Promise<UserResponseDto> {
    const emailTaken = await this.userRepository.existsBy({
      email: createUserDto.email,
    });
    if (emailTaken) {
      throw new ConflictException({ message: 'This email address is already registered to another account.', code: 'EMAIL_IN_USE' });
    }

    const usernameTaken = await this.userRepository.existsBy({
      username: createUserDto.username,
    });
    if (usernameTaken) {
      throw new ConflictException({ message: 'This username is already taken. Please choose another one.', code: 'USERNAME_IN_USE' });
    }

    const user = this.userMapper.toEntity(createUserDto);

    if (currentUser?.tenantId && user.role !== UserRole.TENANT_OWNER) {
      user.tenantId = currentUser.tenantId;
    }

    // Auto-create tenant and warehouse for tenant_owner registration BEFORE saving the user
    // to avoid multiple saves which would trigger double-hashing of the password.
    if (user.role === UserRole.TENANT_OWNER) {
      const tenant = this.tenantRepository.create({
        name: createUserDto.name + "'s Organization",
      });
      const savedTenant = await this.tenantRepository.save(tenant);
      user.tenantId = savedTenant.id;
      this.logger.log(`Tenant created: ${savedTenant.id}`);

      if (!createUserDto.warehouseId && createUserDto.warehouseName) {
        const warehouse = this.warehouseRepository.create({
          name: createUserDto.warehouseName,
          location: createUserDto.warehouseLocation ?? null,
          tenantId: savedTenant.id,
          isMain: true,
        });
        const savedWarehouse = await this.warehouseRepository.save(warehouse);
        user.warehouseId = savedWarehouse.id;
        this.logger.log(`Warehouse created for new tenant: ${savedWarehouse.id}`);
      }
    }

    const saved = await this.userRepository.save(user);
    this.logger.log(`User created: ${saved.id}`);
    return this.userMapper.toResponse(saved);
  }

  /**
   * Return all active (non-deleted) users scoped to tenant.
   */
  async findAll(currentUser: UserResponseDto, query: PaginationQueryDto): Promise<{ data: UserResponseDto[]; total: number }> {
    const qb = this.userRepository.createQueryBuilder('user');

    if (currentUser.role !== UserRole.SUPER_ADMIN) {
      qb.andWhere('user.tenantId = :tenantId', { tenantId: currentUser.tenantId });
    }
    applySortAndSearch(qb, 'user', query.sortBy, query.sortOrder, query.search, ['username', 'email', 'name']);
    const result = await paginate(qb, query.page!, query.limit!);
    return { data: this.userMapper.toResponseList(result.data), total: result.total };
  }

  /**
   * Find a single user by UUID and return a safe response DTO.
   */
  async findById(currentUser: UserResponseDto | null, id: string): Promise<UserResponseDto> {
    const query: any = { id };
    if (currentUser && currentUser.role !== UserRole.SUPER_ADMIN) {
      query.tenantId = currentUser.tenantId;
    }
    const user = await this.userRepository.findOne({ where: query });
    if (!user) {
      throw new NotFoundException({ message: "We couldn't find this user's account.", code: 'USER_NOT_FOUND' });
    }
    return this.userMapper.toResponse(user);
  }

  async findMe(id: string): Promise<UserResponseDto> {
    return this.findById(null, id);
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

  async findByGoogleId(googleId: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { googleId } });
  }

  async createGoogleUser(profile: any): Promise<User> {
    const tenant = this.tenantRepository.create({
      name: (profile.firstName || profile.email.split('@')[0]) + "'s Organization",
    });
    const savedTenant = await this.tenantRepository.save(tenant);
    this.logger.log(`Tenant created for Google user: ${savedTenant.id}`);

    const user = this.userRepository.create({
      email: profile.email,
      username: profile.email.split('@')[0] + Math.floor(Math.random() * 10000).toString(),
      name: `${profile.firstName} ${profile.lastName}`.trim() || profile.email.split('@')[0],
      avatarUrl: profile.picture,
      googleId: profile.googleId,
      role: UserRole.TENANT_OWNER,
      tenantId: savedTenant.id,
      isActive: true,
      passwordHash: null,
    });
    
    const saved = await this.userRepository.save(user);
    this.logger.log(`Google User created: ${saved.id}`);
    return saved;
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
  async update(currentUser: UserResponseDto, id: string, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
    const query: any = { id };
    if (currentUser.role !== UserRole.SUPER_ADMIN) {
      query.tenantId = currentUser.tenantId;
    }
    const existing = await this.userRepository.findOne({ where: query });
    if (!existing) {
      throw new NotFoundException({ message: "We couldn't find this user's account.", code: 'USER_NOT_FOUND' });
    }

    const updates: Partial<User> = {};

    if (updateUserDto.email && updateUserDto.email !== existing.email) {
      const emailTaken = await this.userRepository.existsBy({ email: updateUserDto.email });
      if (emailTaken) {
        throw new ConflictException({ message: 'This email address is already registered to another account.', code: 'EMAIL_IN_USE' });
      }
      updates.email = updateUserDto.email.toLowerCase().trim();
    }

    if (updateUserDto.username && updateUserDto.username !== existing.username) {
      const usernameTaken = await this.userRepository.existsBy({ username: updateUserDto.username });
      if (usernameTaken) {
        throw new ConflictException({ message: 'This username is already taken. Please choose another one.', code: 'USERNAME_IN_USE' });
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

  async updateMe(id: string, updateProfileDto: UpdateProfileDto): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    if (updateProfileDto.name !== undefined) {
      user.name = updateProfileDto.name;
    }
    if (updateProfileDto.phone !== undefined) {
      user.phone = updateProfileDto.phone ?? null;
    }
    if (updateProfileDto.location !== undefined) {
      user.location = updateProfileDto.location ?? null;
    }
    if (updateProfileDto.bio !== undefined) {
      user.bio = updateProfileDto.bio ?? null;
    }
    if (updateProfileDto.avatarUrl !== undefined) {
      user.avatarUrl = updateProfileDto.avatarUrl ?? null;
    }

    const saved = await this.userRepository.save(user);
    this.logger.log(`User profile updated: ${saved.id}`);
    return this.userMapper.toResponse(saved);
  }

  /**
   * Soft-delete a user by ID (sets deletedAt; record is preserved in DB).
   */
  async remove(currentUser: UserResponseDto, id: string): Promise<void> {
    const query: any = { id };
    if (currentUser.role !== UserRole.SUPER_ADMIN) {
      query.tenantId = currentUser.tenantId;
    }
    const user = await this.userRepository.findOne({ where: query });
    if (!user) {
      throw new NotFoundException({ message: "We couldn't find this user's account.", code: 'USER_NOT_FOUND' });
    }
    user.isActive = false;
    await this.userRepository.save(user);
    this.logger.log(`User deactivated: ${id}`);
  }
}
