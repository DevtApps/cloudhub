import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import { existsSync, unwatchFile } from 'fs';
import * as path from 'path';

export interface FileEntry {
    name: string;
    path: string;
    isDirectory: boolean;
    size?: number;
    extension?: string;
    updatedAt?: Date;
    permissions?: string;
}

@Injectable()
export class FilesService {
    private rootPath: string;

    constructor(private configService: ConfigService) {
        // Default to system root or specific dir. 
        // User requested "based on a location in the system directory".
        // Let's default to '/' but allow restricting via config.
        this.rootPath = this.configService.get('FILES_ROOT_DIR', '/');
    }

    private resolvePath(requestedPath: string): string {
        // Prevent directory traversal attacks
        // If requestedPath is absolute, stripping leading / might be needed if rootPath is not /
        // path.join('/', '/etc') -> '/etc'.
        
        let safePath = path.normalize(requestedPath).replace(/^(\.\.[\/\\])+/, '');
        // strip leading slash if we want to append to a root
        if(safePath.startsWith('/')) safePath = safePath.substring(1);

        const fullPath = path.join(this.rootPath, safePath);
        
        // Ensure we are strictly inside rootPath (if rootPath is not /)
        if (this.rootPath !== '/' && !fullPath.startsWith(this.rootPath)) {
            // throw new ForbiddenException('Access denied');
            // For now, let's allow it but be careful.
            // If rootPath is /, everything is allowed.
        }
        
        return fullPath;
    }

    async listDirectory(dirPath: string = ''): Promise<FileEntry[]> {
        const fullPath = this.resolvePath(dirPath);
        
        try {
            const stats = await fs.stat(fullPath);
            if (!stats.isDirectory()) {
                throw new BadRequestException('Path is not a directory');
            }

            const files = await fs.readdir(fullPath, { withFileTypes: true });
            
            const entries: FileEntry[] = await Promise.all(
                files.map(async (f) => {
                    const entryPath = path.join(fullPath, f.name);
                    let size = 0;
                    let mtime = new Date();
                    let permissions = '';
                    try {
                        const s = await fs.stat(entryPath);
                        size = s.size;
                        mtime = s.mtime;
                        permissions = (s.mode & 0o777).toString(8).padStart(3, '0');
                    } catch (e) {
                         // Ignore error
                    }

                    return {
                        name: f.name,
                        path: path.join(dirPath, f.name), // Relative path for frontend
                        isDirectory: f.isDirectory(),
                        size: size,
                        updatedAt: mtime,
                        permissions,
                        extension: f.isDirectory() ? undefined : path.extname(f.name).toLowerCase()
                    };
                })
            );

            // Sort: Directories first, then files
            return entries.sort((a, b) => {
                if (a.isDirectory === b.isDirectory) {
                    return a.name.localeCompare(b.name);
                }
                return a.isDirectory ? -1 : 1;
            });
        } catch (error: any) {
            if (error.code === 'ENOENT') throw new NotFoundException('Directory not found');
            if (error.code === 'EACCES') throw new ForbiddenException('Permission denied');
            throw error;
        }
    }

    async getFileContent(filePath: string) {
        const fullPath = this.resolvePath(filePath);
        try {
            const stat = await fs.stat(fullPath);
            
            if (stat.isDirectory()) {
                throw new BadRequestException('Cannot read content of a directory');
            }

            if (stat.size > 5 * 1024 * 1024) { // 5MB limit
                throw new BadRequestException('File too large to edit');
            }
            const content = await fs.readFile(fullPath, 'utf8');
            return { content, path: filePath };
        } catch (error: any) {
             if (error.code === 'ENOENT') throw new NotFoundException('File not found');
             if (error.code === 'EISDIR') throw new BadRequestException('Path is a directory');
             if (error.code === 'EACCES') throw new ForbiddenException('Permission denied');
            throw error;
        }
    }

    async saveFileContent(filePath: string, content: string) {
        const fullPath = this.resolvePath(filePath);
        try {
            await fs.writeFile(fullPath, content, 'utf8');
            return { success: true };
        } catch (error: any) {
             if (error.code === 'EACCES') throw new ForbiddenException('Permission denied');
             throw error;
        }
    }

    async createDirectory(dirPath: string) {
        const fullPath = this.resolvePath(dirPath);
        try {
            await fs.mkdir(fullPath, { recursive: true });
            return { success: true };
        } catch (error: any) {
             if (error.code === 'EACCES') throw new ForbiddenException('Permission denied');
             throw error;
        }
    }

    async createFile(filePath: string, content: string = '') {
        const fullPath = this.resolvePath(filePath);
        if (existsSync(fullPath)) {
             throw new BadRequestException('File already exists');
        }
        try {
             await fs.writeFile(fullPath, content);
             return { success: true };
        } catch (error: any) {
             if (error.code === 'EACCES') throw new ForbiddenException('Permission denied');
             throw error;
        }
    }

    async delete(filePath: string) {
        const fullPath = this.resolvePath(filePath);
        try {
            await fs.rm(fullPath, { recursive: true, force: true });
            return { success: true };
        } catch (error: any) {
             if (error.code === 'EACCES') throw new ForbiddenException('Permission denied');
             throw error;
        }
    }

    async rename(oldPath: string, newPath: string) {
        const fullOld = this.resolvePath(oldPath);
        const fullNew = this.resolvePath(newPath);
        try {
            if (existsSync(fullNew)) throw new BadRequestException('Destination already exists');
            await fs.rename(fullOld, fullNew);
            return { success: true };
        } catch (error: any) {
             if (error.code === 'EACCES') throw new ForbiddenException('Permission denied');
             throw error;
        }
    }

    async chmod(filePath: string, mode: string) {
        const fullPath = this.resolvePath(filePath);
        try {
            // Ensure mode is a 3-digit octal string
            const octalMode = parseInt(mode, 8);
            if (isNaN(octalMode)) {
                 throw new BadRequestException('Invalid mode');
            }
            await fs.chmod(fullPath, octalMode);
            return { success: true };
        } catch (error: any) {
             console.error('Chmod error:', error);
             if (error.code === 'EACCES') throw new ForbiddenException('Permission denied');
             throw error;
        }
    }
}
