import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentStatus } from '@ledgerline/shared';
import { ClientScopeGuard } from '../common/guards/client-scope.guard';
import { CurrentClientId } from '../common/decorators/current-client-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ValidationError } from '../common/errors/domain-errors';
import { DocumentsService } from './documents.service';
import { ApproveDocumentDto } from './dto/approve-document.dto';
import { RejectDocumentDto } from './dto/reject-document.dto';

@Controller('documents')
@UseGuards(ClientScopeGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  upload(
    @CurrentClientId() clientId: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new ValidationError('No file was uploaded');
    return this.documents.upload(clientId, user, file);
  }

  @Get()
  list(@CurrentClientId() clientId: string, @Query('status') status?: DocumentStatus) {
    return this.documents.list(clientId, status);
  }

  @Get(':id')
  getOne(@CurrentClientId() clientId: string, @Param('id') id: string) {
    return this.documents.getOne(clientId, id);
  }

  @Get(':id/file')
  async getFile(@CurrentClientId() clientId: string, @Param('id') id: string, @Res() res: Response) {
    const { buffer, mimeType } = await this.documents.getFile(clientId, id);
    res.setHeader('Content-Type', mimeType);
    res.send(buffer);
  }

  @Post(':id/extract')
  extract(@CurrentClientId() clientId: string, @Param('id') id: string) {
    return this.documents.extract(clientId, id);
  }

  @Post(':id/approve')
  approve(
    @CurrentClientId() clientId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApproveDocumentDto,
  ) {
    return this.documents.approve(clientId, user, id, dto);
  }

  @Post(':id/reject')
  reject(
    @CurrentClientId() clientId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectDocumentDto,
  ) {
    return this.documents.reject(clientId, user, id, dto.reason);
  }
}
