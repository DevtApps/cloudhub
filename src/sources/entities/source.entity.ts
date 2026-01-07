import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToMany, JoinTable } from 'typeorm';
import { RegexPattern } from '../../regex/entities/regex.entity';

export enum SourceType {
    FILE = 'file',
    // SYSLOG = 'syslog', // Future support
}

@Entity('data_sources')
export class DataSource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({
      type: 'enum',
      enum: SourceType,
      default: SourceType.FILE
  })
  type: SourceType;

  @Column()
  config: string; // JSON string or path. For FILE, it is the path.

  @Column({ default: 'metric-queue' })
  targetQueue: string;

  @Column({ default: true })
  isActive: boolean;

  @ManyToMany(() => RegexPattern, (pattern) => pattern.sources)
  @JoinTable()
  patterns: RegexPattern[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
