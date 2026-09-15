import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { CommunityService } from './community.service';

@UseGuards(AuthGuard)
@Controller('v1')
export class CommunityController {
  constructor(private svc: CommunityService) {}

  @Post('buildings/:id/maintenance')
  createMaintenance(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.createMaintenance(req.user.sub, id, body);
  }

  @Get('buildings/:id/maintenance')
  listMaintenance(@Req() req: any, @Param('id') id: string) {
    return this.svc.listMaintenance(req.user.sub, id);
  }

  @Patch('maintenance/:id')
  updateMaintenance(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.updateMaintenance(req.user.sub, id, body);
  }

  @Post('buildings/:id/proposals')
  createProposal(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.createProposal(req.user.sub, id, body);
  }

  @Get('buildings/:id/proposals')
  listProposals(@Req() req: any, @Param('id') id: string) {
    return this.svc.listProposals(req.user.sub, id);
  }

  @Post('proposals/:id/votes')
  vote(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.vote(req.user.sub, id, body.choice);
  }

  @Post('proposals/:id/close')
  closeProposal(@Req() req: any, @Param('id') id: string) {
    return this.svc.closeProposal(req.user.sub, id);
  }

  @Post('buildings/:id/projects')
  createProject(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.createProject(req.user.sub, id, body);
  }

  @Get('buildings/:id/projects')
  listProjects(@Req() req: any, @Param('id') id: string) {
    return this.svc.listProjects(req.user.sub, id);
  }

  @Patch('projects/:id/status')
  projectStatus(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.updateProjectStatus(req.user.sub, id, body.status);
  }

  @Post('buildings/:id/reimbursements')
  createClaim(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.createClaim(req.user.sub, id, body);
  }

  @Get('buildings/:id/reimbursements')
  listClaims(@Req() req: any, @Param('id') id: string) {
    return this.svc.listClaims(req.user.sub, id);
  }

  @Patch('reimbursements/:id')
  review(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.reviewClaim(req.user.sub, id, body.decision);
  }
}
