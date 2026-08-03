import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Warehouse } from '../warehouses/entities/warehouse.entity';
import { UserMapper } from './mappers/user.mapper';
import { CreateUserDto } from './dto/create-user.dto';

const mockRepository = {
  existsBy: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  softRemove: jest.fn(),
  createQueryBuilder: jest.fn(),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        UserMapper,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(Warehouse),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create()', () => {
    const dto: CreateUserDto = {
      email: 'test@example.com',
      username: 'testuser',
      password: 'StrongPass1@',
    };

    it('throws ConflictException if email is already taken', async () => {
      mockRepository.existsBy.mockResolvedValueOnce(true);
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException if username is already taken', async () => {
      mockRepository.existsBy
        .mockResolvedValueOnce(false) // email not taken
        .mockResolvedValueOnce(true); // username taken
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('saves and returns a UserResponseDto on success', async () => {
      mockRepository.existsBy.mockResolvedValue(false);
      const savedUser = { id: 'uuid-1', ...dto, role: 'user', isActive: true, createdAt: new Date(), updatedAt: new Date() };
      mockRepository.save.mockResolvedValueOnce(savedUser);

      const result = await service.create(dto);
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
      expect(result.id).toBe('uuid-1');
      expect(result).not.toHaveProperty('password');
    });
  });

  describe('findById()', () => {
    it('throws NotFoundException when user does not exist', async () => {
      mockRepository.findOne.mockResolvedValueOnce(null);
      await expect(service.findById('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove()', () => {
    it('throws NotFoundException when user does not exist', async () => {
      mockRepository.findOne.mockResolvedValueOnce(null);
      await expect(service.remove('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('calls softRemove when user exists', async () => {
      const user = { id: 'uuid-1' } as User;
      mockRepository.findOne.mockResolvedValueOnce(user);
      mockRepository.softRemove.mockResolvedValueOnce(user);
      await service.remove('uuid-1');
      expect(mockRepository.softRemove).toHaveBeenCalledWith(user);
    });
  });
});
