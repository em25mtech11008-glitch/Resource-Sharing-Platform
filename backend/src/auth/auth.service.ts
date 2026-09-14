import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, Role } from '../database/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async register(username: string, passwordHash: string, role: Role = Role.USER): Promise<any> {
    const existingUser = await this.usersRepository.findOne({ where: { username } });
    if (existingUser) {
      throw new ConflictException('Username already exists');
    }
    
    const salt = await bcrypt.genSalt();
    const hash = await bcrypt.hash(passwordHash, salt);
    
    const user = this.usersRepository.create({ username, passwordHash: hash, role });
    await this.usersRepository.save(user);
    
    return this.login(user);
  }

  async login(user: any) {
    let userEntity = user;
    if (typeof user.passwordHash === 'string' && user.id) {
       // It's already the entity
    } else {
       userEntity = await this.validateUser(user.username, user.password);
       if (!userEntity) {
         throw new UnauthorizedException('Invalid credentials');
       }
    }
    
    const payload = { username: userEntity.username, sub: userEntity.id, role: userEntity.role };
    return {
      access_token: this.jwtService.sign(payload),
      role: userEntity.role
    };
  }

  async validateUser(username: string, pass: string): Promise<any> {
    const user = await this.usersRepository.findOne({ where: { username } });
    if (user && await bcrypt.compare(pass, user.passwordHash)) {
      const { passwordHash, ...result } = user;
      return result;
    }
    return null;
  }
}
