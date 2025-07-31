import SettingUtils from "../SettingUtils";
import { Logger } from "../Utils";

export default function ActionResetAndReloadExtension() {
	try {
		Logger.log("🔄 Resetting and reloading i18n CodeLens extension...");
		const instance = SettingUtils.getInstance(true);
		instance.initialize();
		Logger.log("✅ Extension reset and reload completed");
	} catch (error) {
		Logger.log("❌ ERROR during extension reset and reload:", error);
		throw error;
	}
}

