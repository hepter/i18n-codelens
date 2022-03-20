import SettingUtils from "../SettingUtils";


export default function ActionResetAndReloadExtension() {
	const instance = SettingUtils.getInstance(true);
	instance.initialize();

}

