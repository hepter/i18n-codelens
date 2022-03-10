
import { getLanguageResourcesFiles } from '../Utils';

export default async (fileFsPath?: string) => {
	await getLanguageResourcesFiles(true, fileFsPath);
};

