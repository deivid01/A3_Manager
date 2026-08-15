import type {
  CompanySettings,
  Customer,
  CustomerSearchResult,
  Equipment,
  EquipmentSearchResult,
  PagedResult,
  RentalDetail,
  RentalListItem,
  User,
} from "../domain/types";
import type { SqlJsDatabase } from "../infrastructure/database/SqlJsDatabase";
import type {
  CompanyInput,
  CustomerInput,
  EquipmentInput,
  LoginInput,
  RentalFilters,
  RentalLaunchInput,
  UserInput,
} from "../shared/contracts";
import { AuthApplicationService } from "./services/AuthApplicationService";
import { CompanyApplicationService } from "./services/CompanyApplicationService";
import { CustomerApplicationService } from "./services/CustomerApplicationService";
import { EquipmentApplicationService } from "./services/EquipmentApplicationService";
import { RentalApplicationService } from "./services/RentalApplicationService";

export class ApplicationService {
  private readonly auth: AuthApplicationService;
  private readonly company: CompanyApplicationService;
  private readonly customers: CustomerApplicationService;
  private readonly equipment: EquipmentApplicationService;
  private readonly rentals: RentalApplicationService;

  constructor(db: SqlJsDatabase) {
    this.auth = new AuthApplicationService(db);
    this.company = new CompanyApplicationService(db);
    this.customers = new CustomerApplicationService(db);
    this.equipment = new EquipmentApplicationService(db);
    this.rentals = new RentalApplicationService(db, this.company);
  }

  async initialize(): Promise<void> {
    await this.auth.initialize();
    this.company.initialize();
  }

  login(input: LoginInput): Promise<User> {
    return this.auth.login(input);
  }
  listUsers(): User[] {
    return this.auth.listUsers();
  }
  createUser(input: UserInput): Promise<User> {
    return this.auth.createUser(input);
  }
  getCompany(): CompanySettings {
    return this.company.get();
  }
  saveCompany(input: CompanyInput): CompanySettings {
    return this.company.save(input);
  }
  listCustomers(search: string): Customer[] {
    return this.customers.list(search);
  }
  searchCustomers(search: string): CustomerSearchResult[] {
    return this.customers.search(search);
  }
  createCustomer(input: CustomerInput): Customer {
    return this.customers.create(input);
  }
  updateCustomer(id: string, input: CustomerInput): Customer {
    return this.customers.update(id, input);
  }
  archiveCustomer(id: string): void {
    this.customers.archive(id);
  }
  listEquipment(search: string): Equipment[] {
    return this.equipment.list(search);
  }
  searchEquipment(search: string): EquipmentSearchResult[] {
    return this.equipment.search(search);
  }
  createEquipment(input: EquipmentInput): Equipment {
    return this.equipment.create(input);
  }
  updateEquipment(id: string, input: EquipmentInput): Equipment {
    return this.equipment.update(id, input);
  }
  archiveEquipment(id: string): void {
    this.equipment.archive(id);
  }
  launchRental(input: RentalLaunchInput, userId: string): RentalDetail {
    return this.rentals.launch(input, userId);
  }
  listRentals(filters: RentalFilters): PagedResult<RentalListItem> {
    return this.rentals.list(filters);
  }
  getRental(id: string): RentalDetail {
    return this.rentals.get(id);
  }
  finalizeRental(id: string): RentalDetail {
    return this.rentals.finalize(id);
  }
}
