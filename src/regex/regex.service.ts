import { Injectable, NotFoundException, BadRequestException, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { RegexPattern } from './entities/regex.entity';
import { CreateRegexDto } from './dto/create-regex.dto';
import { UpdateRegexDto } from './dto/update-regex.dto';
import { DEFAULT_PATTERN_SEEDS } from './default-patterns';

@Injectable()
export class RegexService implements OnModuleInit {
  private readonly logger = new Logger(RegexService.name);

  constructor(
    @InjectRepository(RegexPattern)
    private regexRepository: Repository<RegexPattern>,
  ) {}

  async onModuleInit() {
    await this.seedDefaultsIfNeeded();
  }

  private async seedDefaultsIfNeeded() {
    for (const seed of DEFAULT_PATTERN_SEEDS) {
      const existing = await this.regexRepository.findOne({ where: { key: seed.key } });

      if (!existing) {
        await this.regexRepository.save(
          this.regexRepository.create({
            ...seed,
            isSystem: true,
          }),
        );
        continue;
      }

      if (!existing.isSystem) {
        this.logger.warn(
          `Skipping default seed for key '${seed.key}' because a custom pattern already exists with this key.`,
        );
        continue;
      }

      await this.regexRepository.save({
        ...existing,
        ...seed,
        isSystem: true,
      });
    }
  }

  async create(createRegexDto: CreateRegexDto): Promise<RegexPattern> {
    // Validate regex validity
    try {
      new RegExp(createRegexDto.pattern);
    } catch (e) {
      throw new BadRequestException(`Invalid regex pattern: ${e.message}`);
    }

    const pattern = this.regexRepository.create(createRegexDto);
    return this.regexRepository.save(pattern);
  }

  async findAll(): Promise<RegexPattern[]> {
    return this.regexRepository.find({ order: { name: 'ASC' } });
  }

  async findByIds(ids: string[]): Promise<RegexPattern[]> {
    if (!ids?.length) return [];
    return this.regexRepository.find({
      where: { id: In(ids) },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<RegexPattern> {
    const pattern = await this.regexRepository.findOneBy({ id });
    if (!pattern) {
      throw new NotFoundException(`Regex pattern with ID ${id} not found`);
    }
    return pattern;
  }

  async update(id: string, updateRegexDto: UpdateRegexDto): Promise<RegexPattern> {
    const pattern = await this.findOne(id);
    
    if (updateRegexDto.pattern) {
       try {
        new RegExp(updateRegexDto.pattern);
      } catch (e) {
        throw new BadRequestException(`Invalid regex pattern: ${e.message}`);
      }
    }

    Object.assign(pattern, updateRegexDto);
    return this.regexRepository.save(pattern);
  }

  async remove(id: string): Promise<void> {
    const pattern = await this.findOne(id);
    if (pattern.isSystem) {
        throw new BadRequestException('Cannot delete system patterns');
    }
    await this.regexRepository.remove(pattern);
  }

  test(pattern: string, testString: string) {
    try {
      const regex = new RegExp(pattern);
      const isMatch = regex.test(testString);
      const match = regex.exec(testString);
      
      const namedGroups = match?.groups || {};
      const captured = match ? Array.from(match).slice(1) : [];

      return {
        isMatch,
        matches: {
          ...namedGroups,
          _captured: captured
        },
        fullMatch: match ? match[0] : null
      };
    } catch (e) {
        return { isMatch: false, error: e.message };
    }
  }

  matchPatterns(line: string, patterns: RegexPattern[]) {
      const results = [];
      for (const p of patterns) {
          if (!p.enabled) continue;
          try {
              const regex = new RegExp(p.pattern);
              const match = regex.exec(line);
              if (match) {
                  const groups = match.groups || {};
                  results.push({
                      patternId: p.id,
                      patternKey: p.key,
                      data: groups
                  });
              }
          } catch (e) {
              // Ignore invalid regexes during runtime
          }
      }

      if (results.length > 0) {
          return {
              success: true,
              matches: results
          };
      }

      return { success: false, message: "No match found" };
  }

  async parseLine(line: string) {
      const patterns = await this.findAll();
      return this.matchPatterns(line, patterns);
  }
}
