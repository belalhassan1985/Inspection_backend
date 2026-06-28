import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    await this.syncSequences();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async syncSequences() {
    const tables = [
      { table: 'primary_criteria', seq: 'primary_criteria_id_seq' },
      { table: 'secondary_criteria', seq: 'secondary_criteria_id_seq' },
      { table: 'criteria_details', seq: 'criteria_details_id_seq' },
      { table: 'criteria_options', seq: 'criteria_options_id_seq' },
      {
        table: 'evaluation_option_types',
        seq: 'evaluation_option_types_id_seq',
      },
    ];

    for (const { table, seq } of tables) {
      try {
        const [maxRow] = await this.$queryRawUnsafe<
          Array<{ max_id: bigint | null }>
        >(`SELECT COALESCE(MAX(id), 0) AS max_id FROM "${table}"`);
        const maxId = Number(maxRow?.max_id ?? 0);

        // Set sequence to max_id so the next insert uses max_id + 1
        await this.$executeRawUnsafe(`SELECT setval('${seq}', ${maxId}, true)`);

        this.logger.log(`Sequence ${seq} synchronized (max_id=${maxId})`);
      } catch (err) {
        this.logger.warn(
          `Could not sync sequence ${seq}: ${(err as Error).message}`,
        );
      }
    }
  }
}
