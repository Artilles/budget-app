/**
 * Ambient declarations for the parts of the File System Access API that
 * TypeScript's lib.dom does not ship — chiefly the picker entry points and the
 * Chrome permission extensions, which are what make "remember the file across
 * reloads" possible.
 */

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
  queryPermission?(desc?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission?(desc?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface OpenFilePickerOptions {
  id?: string;
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: FilePickerAcceptType[];
  startIn?: FileSystemHandle | string;
}

interface SaveFilePickerOptions {
  id?: string;
  suggestedName?: string;
  excludeAcceptAllOption?: boolean;
  types?: FilePickerAcceptType[];
  startIn?: FileSystemHandle | string;
}

interface Window {
  showOpenFilePicker?(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
}
