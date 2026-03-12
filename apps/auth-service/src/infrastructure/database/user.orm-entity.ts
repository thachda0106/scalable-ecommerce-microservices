import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class UserOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  /**
   * Nullable to support OAuth-only users who authenticate via Google/GitHub
   * and have no local password. Password-based users always have a hash.
   */
  @Column({ nullable: true })
  passwordHash: string | null;

  @Column({ type: 'varchar', length: 50 })
  role: string;

  @Column({ default: false })
  isEmailVerified: boolean;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
