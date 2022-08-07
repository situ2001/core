/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as Y from 'yjs';

import { EventBusImpl, IEventBus, ILogger, URI } from '@opensumi/ide-core-common';
import { INodeLogger } from '@opensumi/ide-core-node';
import { createBrowserInjector } from '@opensumi/ide-dev-tool/src/injector-helper';
import { MockInjector } from '@opensumi/ide-dev-tool/src/mock-injector';
import { WorkbenchEditorService } from '@opensumi/ide-editor';
import {
  EditorDocumentModelCreationEvent,
  EditorDocumentModelRemovalEvent,
  EditorGroupCloseEvent,
  EditorGroupOpenEvent,
  IEditorDocumentModelCreationEventPayload,
  IEditorDocumentModelService,
} from '@opensumi/ide-editor/lib/browser';
import { IFileService } from '@opensumi/ide-file-service';
import * as monaco from '@opensumi/monaco-editor-core/esm/vs/editor/editor.api';
import { createModel } from '@opensumi/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneEditor';

import { CollaborationServiceForClientPath, ICollaborationService, IYWebsocketServer } from '../../src';
import { CollaborationService } from '../../src/browser/collaboration.service';
import { TextModelBinding } from '../../src/browser/textmodel-binding';
import { CollaborationServiceForClient } from '../../src/node/collaboration.service';
import { YWebsocketServerImpl } from '../../src/node/y-websocket-server';

describe('CollaborationService basic routines', () => {
  let injector: MockInjector;
  let service: CollaborationService;
  let server: YWebsocketServerImpl;
  let eventBus: IEventBus;
  let workbenchEditorService: WorkbenchEditorService;

  const MOCK_URI = 'file://home/situ2001/114514/1919810';

  beforeAll(() => {
    injector = createBrowserInjector([]);
    injector.mockService(ILogger);
    injector.mockService(INodeLogger);
    injector.mockService(IFileService);
    injector.addProviders(
      {
        token: ICollaborationService,
        useClass: CollaborationService,
      },
      {
        token: IYWebsocketServer,
        useClass: YWebsocketServerImpl,
      },
      {
        token: CollaborationServiceForClientPath,
        useClass: CollaborationServiceForClient,
      },
    );
    injector.addProviders({
      token: IEventBus,
      useClass: EventBusImpl,
    });

    injector.addProviders({
      token: WorkbenchEditorService,
      useValue: {
        currentResource: {
          uri: {
            toString: jest.fn().mockImplementation(() => MOCK_URI),
          },
        },
      },
    });
    workbenchEditorService = injector.get(WorkbenchEditorService);

    server = injector.get(YWebsocketServerImpl);
    eventBus = injector.get(IEventBus);
    service = injector.get(ICollaborationService);

    // mock impl, because origin impl comes with nodejs
    const serviceForClient: CollaborationServiceForClient = injector.get(CollaborationServiceForClientPath);
    jest.spyOn(serviceForClient, 'requestInitContent').mockImplementation(async (uri: string) => {
      if (!serviceForClient['yMap'].has(uri)) {
        serviceForClient['yMap'].set(uri, new Y.Text('init content'));
      }
    });

    // mock model manager
    injector.addProviders({
      token: IEditorDocumentModelService,
      useValue: {
        getModelReference: jest.fn().mockImplementation(function () {
          return {
            instance: {
              getMonacoModel: () => {
                const model = createModel('', undefined);
                return model;
              },
            },
          };
        }),
      },
    });

    // start server
    server.initialize();
  });

  it('should successfully initialize', () => {
    const spy = jest.spyOn(service, 'initialize');
    service.initialize();
    expect(spy).toBeCalled();
  });

  it('should create a new binding when EditorDocumentModelCreationEvent', async () => {
    // old
    let _handler: () => void;
    const promise = new Promise((resolve) => {
      const handler = () => resolve(1);
      _handler = handler;
      service['yTextMap'].observe(handler);
    }).finally(() => service['yTextMap'].unobserve(_handler));

    const event = new EditorDocumentModelCreationEvent({
      uri: monaco.Uri.parse(MOCK_URI),
    } as any as IEditorDocumentModelCreationEventPayload);
    eventBus.fire(event);

    // if now comes some editors
    const editor = monaco.editor.create(document.createElement('div'), { value: '' });
    eventBus.fire(
      new EditorGroupOpenEvent({
        resource: {
          uri: {
            toString: jest.fn().mockImplementation(() => MOCK_URI),
          },
        } as any,
        group: {
          codeEditor: { monacoEditor: editor },
        } as any,
      }),
    );
    const editor1 = monaco.editor.create(document.createElement('div'), { value: '' });
    eventBus.fire(
      new EditorGroupOpenEvent({
        resource: {
          uri: {
            toString: jest.fn().mockImplementation(() => MOCK_URI),
          },
        } as any,
        group: {
          codeEditor: { monacoEditor: editor1 },
        } as any,
      }),
    );

    expect(service['pendingBinding'].has(MOCK_URI)).toBeTruthy();
    const pending = service['pendingBinding'].get(MOCK_URI);
    expect(pending?.editor.size).toBe(2);

    await promise;

    expect(service['pendingBinding'].has(MOCK_URI)).not.toBeTruthy();

    const binding = service['getBinding'](MOCK_URI);
    expect(binding).toBeInstanceOf(TextModelBinding);
    expect(binding?.editors.size).toBe(2);
  });

  it('should call undo and redo on current binding', () => {
    const targetBinding = service['getBinding'](MOCK_URI) as TextModelBinding;
    expect(targetBinding).toBeInstanceOf(TextModelBinding);
    const undoSpy = jest.spyOn(targetBinding, 'undo');
    const redoSpy = jest.spyOn(targetBinding, 'redo');
    service.undoOnCurrentResource();
    service.redoOnCurrentResource();
    expect(undoSpy).toBeCalled();
    expect(redoSpy).toBeCalled();
  });

  it('should react on EditorGroupOpenEvent', () => {
    const event = new EditorGroupOpenEvent({
      resource: {
        uri: {
          toString: jest.fn().mockImplementation(() => MOCK_URI),
        },
      } as any,
      group: {
        codeEditor: { monacoEditor: jest.fn() },
      } as any,
    });

    const binding = service['getBinding'](event.payload.resource.uri.toString());
    const spy = jest.spyOn(binding as any, 'addEditor').mockImplementation(() => {});

    eventBus.fire(event);

    expect(spy).toBeCalled();
  });

  it('should react on EditorGroupCloseEvent', () => {
    const event = new EditorGroupCloseEvent({
      resource: {
        uri: {
          toString: jest.fn().mockImplementation(() => MOCK_URI),
        },
      } as any,
      group: {
        codeEditor: jest.fn(),
      } as any,
    });

    const binding = service['getBinding'](event.payload.resource.uri.toString());
    const spy = jest.spyOn(binding as any, 'removeEditor').mockImplementation(() => {});

    eventBus.fire(event);

    expect(spy).toBeCalled();
  });

  it('should react on EditorDocumentModelRemovalEvent', () => {
    const event = new EditorDocumentModelRemovalEvent({
      codeUri: {
        toString: () => MOCK_URI,
        scheme: 'file',
      },
    } as any);
    eventBus.fire(event);
    expect(service['bindingMap'].has(MOCK_URI)).not.toBeTruthy();
  });

  it('should react on FileChangeEvent', () => {
    // const handlerSpy = jest.spyOn(service as any, 'fileChangeEventHandler');
    service['yTextMap'].set('file://1919810', new Y.Text(''));
    service['createAndSetBinding']('file://1919810', createModel('', undefined));
    const removeBindingSpy = jest.spyOn(service as any, 'removeBinding');

    // delete a file in a naive way
    service['yTextMap'].delete('file://1919810');

    // expect(handlerSpy).toBeCalled();
    expect(removeBindingSpy).toBeCalled();
  });

  it('should successfully destroy', () => {
    const spy = jest.spyOn(service, 'destroy');
    service.destroy();
    expect(spy).toBeCalled();
  });

  afterAll(() => {
    server.dispose();
  });
});
