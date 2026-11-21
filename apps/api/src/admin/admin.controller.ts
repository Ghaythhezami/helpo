import { Controller, Get, UseGuards } from "@nestjs/common";
import { AdminGuard } from "./admin.guard";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("overview")
  overview() {
    return this.admin.overview();
  }
}
