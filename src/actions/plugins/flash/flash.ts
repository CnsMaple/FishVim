import { Mode } from '../../../mode/mode';
import { cleanFlashMarkers } from './flashMarker';
import { escapeCSSIcons } from '../../../util/statusBarTextUtils';
import { VimState } from '../../../state/vimState';
import { Cursor } from '../../../common/motion/cursor';

export class Flash {
  public searchString: string = '';
  public previousMode: Mode | undefined = undefined;
  public previousSearchString: string = '';
  public firstSearchChat: string = '';
  public multipleSelectCursor: boolean = false;
  public multipleSelectCursorList: Cursor[] = [];

  displayStatusBarText(cursorChar: string) {
    if (this.multipleSelectCursor) {
      return escapeCSSIcons(
        `multiple ${this.multipleSelectCursorList.length} flash:${this.searchString}${cursorChar}`,
      );
    } else {
      return escapeCSSIcons(`flash:${this.searchString}${cursorChar}`);
    }
  }

  appendSearchString(chat: string) {
    this.searchString += chat;
  }

  deleteSearchString() {
    this.searchString = this.searchString.slice(0, -1);
  }

  recordPreviousMode(mode: Mode) {
    this.previousMode = mode;
  }
  clean() {
    cleanFlashMarkers(this);
  }

  recordSearchString() {
    this.previousSearchString = this.searchString;
  }
}

export function createFlash(vimState: VimState) {
  const flash = new Flash();
  flash.previousSearchString = vimState.flash.previousSearchString;
  flash.previousMode = vimState.currentMode;
  return flash;
}
