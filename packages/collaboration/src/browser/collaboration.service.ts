/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

import { Injectable, Autowired, Inject, INJECTOR_TOKEN, Injector } from '@opensumi/di';
import { ILogger, OnEvent, WithEventBus } from '@opensumi/ide-core-common';
import { WorkbenchEditorService } from '@opensumi/ide-editor';
import {
  EditorDocumentModelCreationEvent,
  EditorDocumentModelRemovalEvent,
  EditorGroupCloseEvent,
  EditorGroupOpenEvent,
  IEditorDocumentModelService,
} from '@opensumi/ide-editor/lib/browser';
import { WorkbenchEditorServiceImpl } from '@opensumi/ide-editor/lib/browser/workbench-editor.service';
import { ITextModel, ICodeEditor } from '@opensumi/ide-monaco';

import {
  CollaborationServiceForClientPath,
  ICollaborationService,
  ICollaborationServiceForClient,
  ROOM_NAME,
} from '../common';

import { TextModelBinding } from './textmodel-binding';

import './styles.less';

class PendingBindingPayload {
  model: ITextModel;
  editor: Set<ICodeEditor>;
}

@Injectable()
export class CollaborationService extends WithEventBus implements ICollaborationService {
  @Autowired(INJECTOR_TOKEN)
  private injector: Injector;

  @Autowired(ILogger)
  private logger: ILogger;

  @Autowired(WorkbenchEditorService)
  private workbenchEditorService: WorkbenchEditorServiceImpl;

  @Autowired(IEditorDocumentModelService)
  private docModelManager: IEditorDocumentModelService;

  private yDoc: Y.Doc;

  private yWebSocketProvider: WebsocketProvider;

  private yTextMap: Y.Map<Y.Text>;

  private bindingMap: Map<string, TextModelBinding> = new Map();

  private pendingBinding: Map<string, PendingBindingPayload> = new Map();

  private yMapObserver = (event: Y.YMapEvent<Y.Text>) => {
    const changes = event.changes.keys;
    changes.forEach((change, key) => {
      this.logger.log('change.action', change.action);
      if (change.action === 'add') {
        // if bindingMap has no key that is equal to key
        if (this.pendingBinding.has(key) && !this.bindingMap.has(key)) {
          // retrieve from payload object, then create new binding
          const payload = this.pendingBinding.get(key)!;
          const binding = this.createAndSetBinding(key, payload.model);
          if (payload.editor) {
            payload.editor.forEach((editor) => binding.addEditor(editor));
          }
          this.pendingBinding.delete(key);
          this.logger.debug('Binding created', binding);
        } else {
          const localBinding = this.getBinding(key);
          if (localBinding) {
            // rebind TextModel with new yText
            this.logger.debug('Local YText is different from remote');
            localBinding.changeYText(this.yTextMap.get(key)!);
          }
        }
      } else if (change.action === 'delete') {
        // do nothing, binding should be removed by textModelRemovalEvent
        // this.removeBinding(key);
      }
    });
  };

  constructor(@Inject(CollaborationServiceForClientPath) private readonly backService: ICollaborationServiceForClient) {
    super();
  }

  initialize() {
    this.yDoc = new Y.Doc();
    this.yTextMap = this.yDoc.getMap();
    this.yWebSocketProvider = new WebsocketProvider('ws://127.0.0.1:12345', ROOM_NAME, this.yDoc); // TODO configurable uri and room name
    this.yTextMap.observe(this.yMapObserver);
    this.logger.debug('Collaboration initialized');
  }

  destroy() {
    this.yTextMap.unobserve(this.yMapObserver);
    this.yWebSocketProvider.disconnect();
    this.bindingMap.forEach((binding) => binding.dispose());
  }

  undoOnCurrentResource() {
    const uri = this.workbenchEditorService.currentResource?.uri.toString();
    if (uri && this.bindingMap.has(uri)) {
      this.bindingMap.get(uri)!.undo();
    }
  }

  redoOnCurrentResource() {
    const uri = this.workbenchEditorService.currentResource?.uri.toString();
    if (uri && this.bindingMap.has(uri)) {
      this.bindingMap.get(uri)!.redo();
    }
  }

  private createAndSetBinding(uri: string, model: ITextModel): TextModelBinding {
    const cond = this.bindingMap.has(uri);

    if (!cond) {
      const binding = this.injector.get(TextModelBinding, [
        this.yTextMap.get(uri)!, // only be called after yMap event
        model,
        this.yWebSocketProvider.awareness,
      ]);
      this.bindingMap.set(uri, binding);
      return binding;
    } else {
      return this.bindingMap.get(uri)!;
    }
  }

  private getBinding(uri: string) {
    const cond = this.bindingMap.has(uri);

    if (cond) {
      return this.bindingMap.get(uri)!;
    } else {
      return null;
    }
  }

  private removeBinding(uri: string) {
    const binding = this.bindingMap.get(uri);

    if (binding) {
      binding.dispose();
      this.bindingMap.delete(uri);
      this.logger.debug('Removed binding');
    }
  }

  // order of events(generally): create docModel(if necessary) => group tab opened
  //                             group tab close => destroy docModel(if necessary)

  @OnEvent(EditorDocumentModelCreationEvent)
  private handleDocumentModelCreation(e: EditorDocumentModelCreationEvent) {
    if (e.payload.uri.scheme === 'file') {
      this.logger.debug('Doc model created', e);

      const { payload } = e;
      const uriString = payload.uri.toString();
      const modelRef = this.docModelManager.getModelReference(payload.uri);
      const monacoTextModel = modelRef?.instance.getMonacoModel();
      modelRef?.dispose(); // be careful

      if (monacoTextModel) {
        this.logger.debug('TextModel', monacoTextModel);

        if (this.yTextMap.has(uriString)) {
          const binding = this.createAndSetBinding(uriString, monacoTextModel);
          this.logger.debug('Binding created', binding);
        } else {
          this.backService.requestInitContent(uriString);
          this.pendingBinding.set(uriString, { model: monacoTextModel, editor: new Set() });
        }
      }
    }
  }

  @OnEvent(EditorDocumentModelRemovalEvent)
  private handleDocumentModelRemoval(e: EditorDocumentModelRemovalEvent) {
    if (e.payload.codeUri.scheme === 'file') {
      this.logger.debug('Doc model removed', e);
      if (this.pendingBinding.has(e.payload.codeUri.toString())) {
        // clean up
        this.pendingBinding.delete(e.payload.codeUri.toString());
      }
      this.removeBinding(e.payload.codeUri.toString());
    }
  }

  @OnEvent(EditorGroupOpenEvent)
  private editorGroupOpenHandler(e: EditorGroupOpenEvent) {
    this.logger.debug('Group open tabs', e, e.payload.group.codeEditor);

    const uriString = e.payload.resource.uri.toString();
    if (this.bindingMap.has(uriString)) {
      this.getBinding(uriString)!.addEditor(e.payload.group.codeEditor.monacoEditor);
    } else {
      // add to pending editor
      const pendingBinding = this.pendingBinding.get(uriString);
      if (pendingBinding) {
        const editor = e.payload.group.codeEditor.monacoEditor;
        pendingBinding.editor.add(editor);
      }
    }
  }

  @OnEvent(EditorGroupCloseEvent)
  private groupCloseHandler(e: EditorGroupCloseEvent) {
    this.logger.debug('Group close tabs', e, e.payload.group.codeEditor);

    // remove editor from binding
    const uriString = e.payload.resource.uri.toString();
    const binding = this.getBinding(uriString);
    if (binding) {
      binding.removeEditor(e.payload.group.codeEditor.monacoEditor);
    }
  }
}
