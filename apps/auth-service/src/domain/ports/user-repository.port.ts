import { User } from "../entities/user.entity";

/**
 * Domain port for user persistence.
 * Returns domain User entities — no ORM types leak across this boundary.
 * The implementation handles ORM ↔ domain mapping internally.
 */
export interface UserRepositoryPort {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<User>;
}

export const USER_REPOSITORY = "USER_REPOSITORY";
