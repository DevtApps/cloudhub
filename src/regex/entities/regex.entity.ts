import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToMany } from 'typeorm';
import { DataSource } from '../../sources/entities/source.entity';

@Entity('regex_patterns')
export class RegexPattern {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  key: string;

  @Column()
  name: string;

  @Column()
  pattern: string;

  @Column({ nullable: true })
  description: string;

  @Column({ default: true })
  enabled: boolean;

  @Column('simple-array', { nullable: true })
  fields: string[];

  @Column({ default: false })
  isSystem: boolean; // Protect system default patterns

  @ManyToMany(() => DataSource, (source) => source.patterns)
  sources: DataSource[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
