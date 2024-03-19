import { BaseCommand } from '../../base';
import { Mode } from '../../../mode/mode';
import { Position } from 'vscode';
import { VimState } from '../../../state/vimState';
import { VimError, ErrorCode } from '../../../error';
import { RegisterAction } from '../../base';
import { StatusBar } from '../../../statusBar';
import { configuration } from '../../../configuration/configuration';
import { createSearchMatches } from './flashMatch';
import {
  findMarkerByLabel,
  createMarkerLabels,
  createMarkers,
  getNextMatchMarker,
  Marker,
  cacheMarker,
  getCacheMarker,
  updateMarkersRangeToForward,
  showMarkers,
  updateMarkerLabel,
  getMatchedMarkers,
  updateMarkersRangeToBackward,
  hideNoMatchedMarkers,
  getPreMarkers,
  updateNextMatchMarker,
  updateViewMarkers,
} from './flashMarker';
import { createFlash } from './flash';
import { Logger } from '../../../util/logger';
import { Cursor } from '../../../common/motion/cursor';
@RegisterAction
class FlashCommand extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
  keys = ['f'];
  override actionType = 'motion' as const;

  public override doesActionApply(vimState: VimState, keysPressed: string[]) {
    return (
      super.doesActionApply(vimState, keysPressed) &&
      configuration.flash.enable &&
      !vimState.isMultiCursor
    );
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    if (!configuration.flash.enable) return;

    vimState.flash = createFlash(vimState);
    await vimState.setCurrentMode(Mode.FlashSearchInProgressMode);
  }
}

@RegisterAction
class MutipleSelectCursor extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
  keys = [['g', 'B']];
  override actionType = 'motion' as const;

  public override doesActionApply(vimState: VimState, keysPressed: string[]) {
    return (
      super.doesActionApply(vimState, keysPressed) &&
      configuration.flash.enable &&
      !vimState.isMultiCursor
    );
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    if (!configuration.flash.enable) return;

    vimState.flash = createFlash(vimState);
    vimState.flash.multipleSelectCursor = true;
    vimState.flash.multipleSelectCursorList = [];
    await vimState.setCurrentMode(Mode.FlashSearchInProgressMode);
  }
}

@RegisterAction
class FlashSearchInProgressCommand extends BaseCommand {
  modes = [Mode.FlashSearchInProgressMode];
  keys = ['<character>'];
  override runsOnceForEveryCursor() {
    return false;
  }
  override runsOnceForEachCountPrefix = true;

  override isJump = true;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const chat = this.keysPressed[0];

    if (this.isTriggerLastSearch(chat, vimState)) {
      await this.handleLastSearch(vimState);
      return;
    }

    if (this.isPressEnter(chat)) {
      if (vimState.flash.multipleSelectCursor) {
        await exitFlashMode(vimState);
        vimState.flash.recordSearchString();
      } else {
        await this.handleEnterJump(vimState);
      }
      return;
    }

    try {
      const marker = findMarkerByLabel(getCacheMarker(vimState.flash.searchString), chat);
      if (marker) {
        await this.handleJump(chat, vimState);
      } else {
        await this.handleSearch(chat, vimState);
      }
    } catch (error) {
      Logger.debug('FlashSearchInProgressCommand error: ' + error);
    }
  }
  private isTriggerLastSearch(chat: string, vimState: VimState) {
    return this.isPressEnter(chat) && vimState.flash.searchString === '';
  }

  private async handleLastSearch(vimState: VimState) {
    if (vimState.flash.previousSearchString.length === 0) {
      StatusBar.displayError(vimState, VimError.fromCode(ErrorCode.NoLastSearch));
      await vimState.setCurrentMode(vimState.flash.previousMode!);
      return;
    }
    await this.handleSearch(vimState.flash.previousSearchString, vimState, true);
  }

  private isPressEnter(chat: string) {
    return chat === '\n';
  }

  private async handleEnterJump(vimState: VimState) {
    const firstMarker = getNextMatchMarker(
      vimState.flash.searchString,
      vimState.cursorStopPosition,
    );

    if (firstMarker) {
      await this.changeCursorPosition(firstMarker, vimState);
    }
  }

  private async handleSearch(chat: string, vimState: VimState, isLastSearch: boolean = false) {
    if (this.isBackSpace(chat)) {
      const markers = getCacheMarker(vimState.flash.searchString);
      if (markers) updateMarkersRangeToForward(markers);

      vimState.flash.deleteSearchString();

      if (vimState.flash.searchString.length === 0) {
        await exitFlashMode(vimState);
      } else {
        await this.deleteSearchString(vimState);
      }
    } else {
      vimState.flash.appendSearchString(chat);

      if (vimState.flash.searchString.length === 1 || isLastSearch) {
        vimState.flash.firstSearchChat = chat;
        await this.handleFirstSearchString(vimState);
      } else {
        await this.handleAppendSearchString(chat, vimState);
      }
    }
  }

  private async deleteSearchString(vimState: VimState) {
    const markers = getCacheMarker(vimState.flash.searchString);
    showMarkers(markers);
    updateMarkerLabel(markers, vimState);
    updateNextMatchMarker(markers, vimState.cursorStopPosition);
  }

  private async handleFirstSearchString(vimState: VimState) {
    const matches = createSearchMatches(vimState.flash.searchString, vimState.document, vimState);
    if (matches.length === 0) return;
    const labels = createMarkerLabels(matches, vimState);
    const markers = createMarkers(matches, labels, vimState.editor);
    cacheMarker(vimState.flash.searchString, markers);
    updateNextMatchMarker(markers, vimState.cursorStopPosition);
    showMarkers(markers);
  }

  private async handleAppendSearchString(chat: string, vimState: VimState) {
    const preMarkers = getPreMarkers(vimState.flash.searchString);
    let matchedMarkers = getCacheMarker(vimState.flash.searchString);
    if (!matchedMarkers) {
      matchedMarkers = getMatchedMarkers(preMarkers, chat, vimState);
      cacheMarker(vimState.flash.searchString, matchedMarkers);
    }
    hideNoMatchedMarkers(preMarkers, matchedMarkers);
    updateMarkersRangeToBackward(matchedMarkers);
    updateMarkerLabel(matchedMarkers, vimState);
    updateNextMatchMarker(matchedMarkers, vimState.cursorStopPosition);
    updateViewMarkers(matchedMarkers);
  }

  private async handleJump(key: string, vimState: VimState) {
    const markerDecoration = findMarkerByLabel(getCacheMarker(vimState.flash.searchString), key);
    if (markerDecoration) {
      await this.changeCursorPosition(markerDecoration, vimState);
    }
  }

  private async changeCursorPosition(marker: Marker, vimState: VimState) {
    const operator = vimState.recordedState.operator;
    let cursorPosition: Position;
    if (operator) {
      cursorPosition = marker.getOperatorPosition();
    } else {
      cursorPosition = marker.getJumpPosition();
    }

    if (vimState.flash.multipleSelectCursor) {
      const newCursor = new Cursor(cursorPosition, cursorPosition);
      const index = vimState.flash.multipleSelectCursorList.findIndex((cursor) => {
        return newCursor.equals(cursor);
      });
      if (index === -1) {
        vimState.flash.multipleSelectCursorList.push(newCursor);
        marker.setMarkerLabelBackgroundColor(
          configuration.flash.marker.multipleSelectMatchBackgroundColor,
        );
      } else {
        vimState.flash.multipleSelectCursorList.splice(index, 1);
        marker.setMarkerLabelBackgroundColor(configuration.flash.marker.backgroundColor);
      }
      marker.updateView();
      vimState.cursors = vimState.flash.multipleSelectCursorList;
    } else {
      vimState.cursorStopPosition = cursorPosition;
      await exitFlashMode(vimState);
      vimState.flash.recordSearchString();
    }
  }

  private isBackSpace(key: string) {
    return key === '<BS>' || key === '<S-BS>';
  }
}
@RegisterAction
class CommandEscFlashSearchInProgressMode extends BaseCommand {
  modes = [Mode.FlashSearchInProgressMode];
  keys = [['<Esc>'], ['<C-c>'], ['<C-[>']];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await exitFlashMode(vimState);
  }
}

async function exitFlashMode(vimState: VimState) {
  await vimState.setCurrentMode(vimState.flash.previousMode!);
  vimState.flash.multipleSelectCursor = false;
  vimState.flash.multipleSelectCursorList = [];
  vimState.flash.clean();
}
