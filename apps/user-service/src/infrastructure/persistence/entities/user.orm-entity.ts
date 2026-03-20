import {
  Entity,
  Column,
  PrimaryColumn,
  OneToOne,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { UserProfileOrmEntity } from './user-profile.orm-entity';
import { UserSettingsOrmEntity } from './user-settings.orm-entity';

@Entity('users')
export class UserOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ type: 'varchar', unique: true })
  username: string;

  @Column({ type: 'varchar' })
  status: string;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToOne(() => UserProfileOrmEntity, (profile) => profile.user, {
    cascade: true,
    eager: true,
  })
  profile: UserProfileOrmEntity;

  @OneToOne(() => UserSettingsOrmEntity, (settings) => settings.user, {
    cascade: true,
    eager: true,
  })
  settings: UserSettingsOrmEntity;
}
