import { Controller, Get, Post, Body, Patch, Param, Delete, BadRequestException, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RegexService } from './regex.service';
import { CreateRegexDto } from './dto/create-regex.dto';
import { UpdateRegexDto } from './dto/update-regex.dto';
import { ApiTags } from '@nestjs/swagger';
import { QueuesService } from '../queues/queues.service';

@ApiTags('regex')
@Controller('regex')
export class RegexController {
  constructor(
    private readonly regexService: RegexService,
    private readonly queuesService: QueuesService,
  ) {}

  @Post()
  create(@Body() createRegexDto: CreateRegexDto) {
    return this.regexService.create(createRegexDto);
  }

  @Get()
  findAll() {
    return this.regexService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.regexService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateRegexDto: UpdateRegexDto) {
    return this.regexService.update(id, updateRegexDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.regexService.remove(id);
  }

  @Post('test')
  test(@Body() body: { pattern: string; testString: string }) {
    return this.regexService.test(body.pattern, body.testString);
  }

  @Post('parse')
  parse(@Body() body: { line: string }) {
      return this.regexService.parseLine(body.line);
  }

  @Post('file-test')
  @UseInterceptors(FileInterceptor('file'))
  async fileTest(
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: {
      patternIds?: string | string[];
      queueName?: string;
      enqueue?: string | boolean;
    },
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const rawPatternIds = body.patternIds;

    const patternIds: string[] = (() => {
      if (!rawPatternIds) return [];
      if (Array.isArray(rawPatternIds)) return rawPatternIds;
      const text = String(rawPatternIds).trim();
      if (!text) return [];
      if (text.startsWith('[')) {
        try {
          const parsed = JSON.parse(text);
          return Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
          return [];
        }
      }
      return text
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    })();

    if (!patternIds.length) {
      throw new BadRequestException('patternIds is required');
    }

    const patterns = await this.regexService.findByIds(patternIds);
    if (!patterns.length) {
      throw new BadRequestException('No patterns found for provided IDs');
    }

    const enqueue = body.enqueue === true || body.enqueue === 'true';
    const queueName = (body.queueName || 'metric-queue').trim();

    const text = file.buffer.toString('utf-8');
    const lines = text.split(/\r?\n/);

    let matchedCount = 0;
    let enqueuedCount = 0;
    const results: Array<{
      lineNumber: number;
      line: string;
      patternId: string;
      patternKey: string;
      data: any;
    }> = [];

    if (enqueue) {
      this.queuesService.registerQueue(queueName);
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !line.trim()) continue;

      const parsed = this.regexService.matchPatterns(line, patterns);
      if (!parsed.success) continue;

      matchedCount++;
      results.push({
        lineNumber: i + 1,
        line,
        patternId: parsed.patternId,
        patternKey: parsed.patternKey,
        data: parsed.data,
      });

      if (enqueue) {
        await this.queuesService.addJob(queueName, {
          source: 'file-test',
          sourceId: null,
          fileName: file.originalname,
          lineNumber: i + 1,
          patternKey: parsed.patternKey,
          patternId: parsed.patternId,
          data: parsed.data,
          timestamp: new Date().toISOString(),
          originalLine: line,
        });
        enqueuedCount++;
      }
    }

    return {
      fileName: file.originalname,
      totalLines: lines.length,
      matchedCount,
      enqueuedCount,
      results,
    };
  }
}
