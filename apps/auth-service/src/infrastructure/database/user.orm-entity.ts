import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('users')
@Index(['provider', 'providerId'], {
  unique: true,
  where: '"provider" IS NOT NULL',
})
export class UserOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  /**
   * Nullable to support OAuth-only users who authenticate via Google/GitHub
   * and have no local password. Password-based users always have a hash.
   */
  @Column({ nullable: true })
  passwordHash!: string | null;

  @Column({ type: 'varchar', length: 50 })
  role!: string;

  @Column({ default: false })
  isEmailVerified!: boolean;

  @Column({ default: true })
  isActive!: boolean;

  // ── OAuth Identity ───────────────────────────────────────────────────────
  /** OAuth provider name: 'google' | 'github' */
  @Column({ nullable: true })
  provider!: string | null;

  /** Opaque ID issued by the OAuth provider */
  @Column({ nullable: true })
  providerId!: string | null;

  @Column({ nullable: true })
  firstName!: string | null;

  @Column({ nullable: true })
  lastName!: string | null;

  @Column({ nullable: true })
  picture!: string | null;

  // ── Multi-tenancy ────────────────────────────────────────────────────────
  @Column({ nullable: true })
  tenantId!: string | null;

  @Column({ nullable: true })
  orgId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
