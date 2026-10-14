export const APP_DISPLAY_NAME = 'lolPing-摸鱼搭子';
export const PACKAGE_NAME = 'lolping-moyudazi-windows';
export const APP_DATA_DIR_NAME = 'lolPing-moyudazi';
export const WINDOWS_APP_ID = 'com.dreamingbetter.lolping.moyudazi.windows';
export const GITHUB_OWNER = 'DreamingBetter';
export const GITHUB_REPO = 'lolPing-moyudazi-Windows';
export const PROJECT_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
export const GITHUB_API_REPO = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
export const LATEST_RELEASE_URL = `${PROJECT_URL}/releases/latest`;

export function releaseTagUrl(version: string): string {
  return `${PROJECT_URL}/releases/tag/v${encodeURIComponent(version)}`;
}
