import { Email } from '../value-objects/email.value-object';
import { Password } from '../value-objects/password.value-object';
import { Role } from '../value-objects/role.enum';

export interface UserProps {
  id: string;
  email: Email;
  password: Password | null; // null for OAuth-only users
  role: Role;
  isEmailVerified: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class User {
  private constructor(private readonly props: UserProps) {}

  public static create(props: UserProps): User {
    return new User(props);
  }

  get id(): string {
    return this.props.id;
  }

  get email(): Email {
    return this.props.email;
  }

  get password(): Password | null {
    return this.props.password;
  }

  get role(): Role {
    return this.props.role;
  }

  get isEmailVerified(): boolean {
    return this.props.isEmailVerified;
  }

  get isActive(): boolean {
    return this.props.isActive;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  // Domain behavior
  public verifyEmail(): void {
    if (this.props.isEmailVerified) {
      throw new Error('Email is already verified');
    }
    this.props.isEmailVerified = true;
    this.props.updatedAt = new Date();
  }

  public changePassword(newPassword: Password): void {
    this.props.password = newPassword;
    this.props.updatedAt = new Date();
  }

  public deactivate(): void {
    if (!this.props.isActive) {
      throw new Error('User is already inactive');
    }
    this.props.isActive = false;
    this.props.updatedAt = new Date();
  }
}
