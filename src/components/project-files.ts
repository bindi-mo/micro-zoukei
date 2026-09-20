// project-files.ts
import type { ProjectFileItem } from '../types/injected';
import { rpcBridge } from './rpc-bridge';

/**
 * Map language to target file extension(s)
 */
const getTargetExtensions = (lang: string): string[] => {
    const langLower = lang.toLowerCase();

    // Python files
    if (['python'].includes(langLower)) {
        return ['.py'];
    }

    // JavaScript/TypeScript files
    if (['javascript'].includes(langLower)) {
        return ['.js'];
    }

    // Lua files
    if (['lua'].includes(langLower)) {
        return ['.lua'];
    }

    // Default: keep original extension
    return [];
};

/**
 * Convert .ms extensions to appropriate target extensions based on language
 */
const convertFileExtensions = (filelist: ProjectFileItem[], lang: string): ProjectFileItem[] => {
    const targetExts = getTargetExtensions(lang);

    if (targetExts.length === 0) {
        return filelist;
    }

    return filelist.map(item => {
        // Only process files with .ms extension
        if (!item.file.toLowerCase().endsWith('.ms')) {
            return item;
        }

        const dir = item.file.substring(0, item.file.lastIndexOf('/'));
        const baseName = item.file.substring(item.file.lastIndexOf('/') + 1);
        const nameWithoutExt = baseName.replace(/\.ms$/i, '');

        // Create target file paths with converted extensions
        const targetFiles: ProjectFileItem[] = [];

        for (const ext of targetExts) {
            const targetPath = dir !== '' ? `${dir}/${nameWithoutExt}${ext}` : `${nameWithoutExt}${ext}`;

            targetFiles.push({
                file: targetPath,
                content: item.content,
                isBinaryBase64: item.isBinaryBase64
            });
        }

        return targetFiles.length > 0 ? targetFiles[0] : item;
    }).flat();
};

const saveAllFilesToLocal = async (title: string, lang: string, filelist: ProjectFileItem[]): Promise<void> => {
    // Convert .ms extensions to appropriate target extensions based on language
    const processedFileList = convertFileExtensions(filelist, lang);

    console.log('Saving files locally:', title, lang, processedFileList.length);
    console.log(processedFileList);

    if (processedFileList.length > 0) {
        await rpcBridge.syncFiles(title, processedFileList);
    } else {
        console.log('not found files');
    }
}

/**
 * Extract Base64 string from a file URL
 */
const fetchAsBase64 = async (url: string): Promise<string> => {
    const response = await fetch(url);
    const blob = await response.blob();

    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64Url = reader.result as string;
            resolve(base64Url.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

/**
 * Process a single file item and extract path and content
 */
const processFileItem = async (item: any): Promise<ProjectFileItem | null> => {
    let fileContent: string = "";
    let isBinaryBase64: boolean = false;

    if (typeof item.content === "string") {
        fileContent = item.content;
    } else if (typeof item.url === "string" && item.url.trim() !== "") {
        try {
            fileContent = await fetchAsBase64(item.url);
            isBinaryBase64 = true;
        } catch (e) {
            // Keep comments minimal as per rule
            console.error(`[Sync Fetch Error] ${item.url}:`, e);
            return null;
        }
    }

    return {
        file: item.file.replace(/-/g, "/"),
        content: fileContent,
        isBinaryBase64: isBinaryBase64
    };
};

/**
 * Process all items for a specific file type category
 */
const processFileGroup = async (fileTypeItems: any[]): Promise<ProjectFileItem[]> => {
    const groupResults: ProjectFileItem[] = [];

    for (const item of fileTypeItems) {
        const processedItem = await processFileItem(item);
        if (processedItem) {
            groupResults.push(processedItem);
        }
    }

    return groupResults;
};

/**
 * Extract a list of paths for all files from microStudio project information
 */
export const getMicroStudioFileList = async (): Promise<ProjectFileItem[]> => {
    const project = (window as any).app?.project;
    if (!project) {
        console.error("There is no information about the project.");
        return [];
    }

    if (!Array.isArray(project.file_types)) {
        return [];
    }

    const fileList: ProjectFileItem[] = [];

    for (const type of project.file_types) {
        const listKey = `${type}_list`;
        const fileTypeItems = project[listKey];

        if (Array.isArray(fileTypeItems)) {
            const groupResults = await processFileGroup(fileTypeItems);
            fileList.push(...groupResults);
        }
    }

    return fileList;
};

/**
 * Check if all items in the project have completed loading
 */
const isProjectDataReady = (project: any): boolean => {
    if (!Array.isArray(project.file_types)) return false;

    for (const type of project.file_types) {
        const listKey = `${type}_list`;
        const fileTypeItems = project[listKey];

        if (Array.isArray(fileTypeItems)) {
            for (const item of fileTypeItems) {
                if (!item) continue;

                // 1. Text source files (source): Wait until `fetched` is true
                if (type === "source") {
                    const isFetched = typeof item.fetched === "boolean" ? item.fetched : true;
                    const hasContent = typeof item.content === "string" && item.content.length > 0;

                    // If not fetched yet and content is empty, consider as pending
                    if (!isFetched && !hasContent) {
                        return false;
                    }
                }
                // 2. Binary assets (sprite, map, asset, sound, music): Only check url/file existence
                else {
                    const hasUrl = typeof item.url === "string" && item.url.trim() !== "";
                    const hasFile = typeof item.file === "string" && item.file.trim() !== "";

                    if (!hasUrl && !hasFile) {
                        return false;
                    }
                }
            }
        }
    }

    return true;
};

/**
 * The microStudio project loading event.
 * A function that hijacks the (openProject) event.
 */
// Add a flag outside the function (in the module scope)
let isProjectAlreadySaved = false;

type Cleanup = () => void;

const NOOP_CLEANUP: Cleanup = () => undefined;

export const overrideProjectLoaded = (): Cleanup => {
    const mainApp = (window as any).app;

    if (!mainApp || typeof mainApp.openProject !== 'function') {
        console.error('Not found window.app.openProject.');
        return NOOP_CLEANUP;
    }

    // Prevent Double Hooks (Duplicate Registrations)
    if ((mainApp.openProject as any).__isOverridden) return NOOP_CLEANUP;

    const originalOpenProject = mainApp.openProject;
    let cancelled = false;
    let pendingTimer: ReturnType<typeof setTimeout> | undefined;

    const newOpenProject = function (this: any, ...args: any[]) {
        const result = originalOpenProject.apply(this, args);

        // Reset the execution flag when the project changes
        isProjectAlreadySaved = false;

        let checkCount = 0;
        const MAX_CHECKS = 20;

        const waitForSourceList = async (): Promise<void> => {
            // Stop if the override has been cleaned up.
            if (cancelled) return;

            // If it has already been saved, terminate the process immediately.
            if (isProjectAlreadySaved) return;

            const project = (window as any).app?.project;

            if (project && Array.isArray(project.source_list) &&
                project.source_list.length > 0 && isProjectDataReady(project)) {
                const lang = project.language;
                const title = project.title;

                // Set a flag just before the call to block the subsequent timer
                isProjectAlreadySaved = true;

                const currentFiles = await getMicroStudioFileList();
                if (cancelled) return;
                if (currentFiles.length > 0) {
                    saveAllFilesToLocal(title, lang, currentFiles);
                }
                return;
            }

            checkCount++;
            if (checkCount >= MAX_CHECKS) {
                console.warn(`⚠️ time out`);
                return;
            }

            pendingTimer = setTimeout(waitForSourceList, 200);
        };

        waitForSourceList();

        return result;
    };

    // Setting the "Hooked" Flag
    (newOpenProject as any).__isOverridden = true;
    mainApp.openProject = newOpenProject;

    console.log('The event hook for `window.app.openProject` has completed.');

    return () => {
        cancelled = true;
        if (pendingTimer !== undefined) {
            clearTimeout(pendingTimer);
            pendingTimer = undefined;
        }

        // Only restore if our wrapper is still installed.
        if (mainApp.openProject === newOpenProject) {
            mainApp.openProject = originalOpenProject;
        }
        delete (newOpenProject as any).__isOverridden;
        isProjectAlreadySaved = false;
    };
};