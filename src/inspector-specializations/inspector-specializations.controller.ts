import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { InspectorSpecializationsService } from './inspector-specializations.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(RolesGuard)
@Controller('inspector-specializations')
export class InspectorSpecializationsController {
  constructor(private readonly service: InspectorSpecializationsService) {}

  // Categories
  @Get('categories')
  getCategories() {
    return this.service.getCategories();
  }

  @Post('categories')
  @Roles('ADMIN')
  createCategory(
    @Body() body: { name: string; description?: string; sortOrder?: number },
  ) {
    return this.service.createCategory(body);
  }

  @Put('categories/:id')
  @Roles('ADMIN')
  updateCategory(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.service.updateCategory(+id, body);
  }

  @Delete('categories/:id')
  @Roles('ADMIN')
  deleteCategory(@Param('id') id: string) {
    return this.service.deleteCategory(+id);
  }

  // Specializations
  @Get()
  getSpecializations(@Query('categoryId') categoryId?: string) {
    return this.service.getSpecializations(
      categoryId ? +categoryId : undefined,
    );
  }

  @Post()
  @Roles('ADMIN')
  createSpecialization(
    @Body()
    body: {
      categoryId: number;
      name: string;
      description?: string;
      sortOrder?: number;
    },
  ) {
    return this.service.createSpecialization(body);
  }

  @Put(':id')
  @Roles('ADMIN')
  updateSpecialization(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.service.updateSpecialization(+id, body);
  }

  @Delete(':id')
  @Roles('ADMIN')
  deleteSpecialization(@Param('id') id: string) {
    return this.service.deleteSpecialization(+id);
  }

  // Inspector Specializations
  @Get('inspector/:inspectorId')
  getInspectorSpecializations(@Param('inspectorId') inspectorId: string) {
    return this.service.getInspectorSpecializations(inspectorId);
  }

  @Post('inspector/:inspectorId')
  @Roles('ADMIN')
  assignSpecialization(
    @Param('inspectorId') inspectorId: string,
    @Body()
    body: {
      specializationId: number;
      proficiencyLevel?: 'BASIC' | 'PRACTITIONER' | 'ADVANCED' | 'EXPERT';
      isPrimary?: boolean;
      notes?: string;
    },
    @Req() req: any,
  ) {
    return this.service.assignSpecialization(inspectorId, {
      ...body,
      assignedById: req.user?.userId,
    });
  }

  @Put('assign/:id')
  @Roles('ADMIN')
  updateInspectorSpecialization(
    @Param('id') id: string,
    @Body()
    body: {
      proficiencyLevel?: 'BASIC' | 'PRACTITIONER' | 'ADVANCED' | 'EXPERT';
      isPrimary?: boolean;
      notes?: string;
    },
  ) {
    return this.service.updateInspectorSpecialization(+id, body);
  }

  @Delete('assign/:id')
  @Roles('ADMIN')
  removeInspectorSpecialization(@Param('id') id: string) {
    return this.service.removeInspectorSpecialization(+id);
  }

  // Seed
  @Post('seed')
  @Roles('ADMIN')
  seedDefaults() {
    return this.service.seedDefaults();
  }
}
