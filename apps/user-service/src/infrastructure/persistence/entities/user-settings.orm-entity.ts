import {
  Entity,
  Column,
  PrimaryColumn,
  OneToOne,
  JoinColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserOrmEntity } from './user.orm-entity';

@Entity('user_settings')
export class UserSettingsOrmEntity {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId: string;

  @Column({ type: 'boolean', name: 'email_notifications', default: true })
  emailNotifications: boolean;

  @Column({ type: 'boolean', name: 'push_notifications', default: true })
  pushNotifications: boolean;

  @Column({ type: 'boolean', name: 'sms_notifications', default: false })
  smsNotifications: boolean;

  @Column({ type: 'varchar', default: 'en' })
  language: string;

  @Column({ type: 'varchar', default: 'UTC' })
  timezone: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToOne(() => UserOrmEntity, (user) => user.settings)
  @JoinColumn({ name: 'user_id' })
  user: UserOrmEntity;
}
