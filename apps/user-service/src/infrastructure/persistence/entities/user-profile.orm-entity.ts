import { Entity, Column, PrimaryColumn, OneToOne, JoinColumn, UpdateDateColumn } from 'typeorm';
import { UserOrmEntity } from './user.orm-entity';

@Entity('user_profiles')
export class UserProfileOrmEntity {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', name: 'display_name', nullable: true })
  displayName: string | null;

  @Column({ type: 'varchar', nullable: true })
  avatar: string | null;

  @Column({ type: 'text', nullable: true })
  bio: string | null;

  @Column({ type: 'varchar', name: 'phone_number', nullable: true })
  phoneNumber: string | null;

  @Column({ type: 'date', name: 'date_of_birth', nullable: true })
  dateOfBirth: Date | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToOne(() => UserOrmEntity, (user) => user.profile)
  @JoinColumn({ name: 'user_id' })
  user: UserOrmEntity;
}
