
import * as React from 'react';
import * as styles from './tree.module.less';
import * as cls from 'classnames';
import { TreeNode, TreeViewAction, TreeViewActionTypes } from './tree';
import { ExpandableTreeNode } from './tree-expansion';
import { SelectableTreeNode } from './tree-selection';
import { TEMP_FILE_NAME } from './tree.view';

export interface TreeNodeProps extends React.PropsWithChildren<any> {
  node: TreeNode;
  leftPadding?: number;
  onSelect?: any;
  onContextMenu?: any;
  onDragStart?: any;
  onDragEnter?: any;
  onDragOver?: any;
  onDragLeave?: any;
  onDrag?: any;
  draggable?: boolean;
  isEdited?: boolean;
  actions?: TreeViewAction[];
  commandActuator?: (commandId: string, params: any) => {};
}

const renderIcon = (node: TreeNode) => {
  return <div className={ cls(node.icon, styles.kt_file_icon) }></div>;
};

const renderDisplayName = (node: TreeNode, updateHandler: any) => {
  const [value, setValue] = React.useState(node.uri ? node.uri.displayName === TEMP_FILE_NAME ? '' : node.uri.displayName : node.name);

  const changeHandler = (event) => {
    setValue(event.target.value);
  };

  const blurHandler = (event) => {
    updateHandler(node, value);
  };

  const keydownHandler = (event: React.KeyboardEvent) => {
    if (event.keyCode === 13) {
      event.stopPropagation();
      event.preventDefault();
      updateHandler(node, value);
    }
  };

  if (node.filestat && node.filestat.isTemporaryFile) {
    return <div
      className={ cls(styles.kt_treenode_segment, styles.kt_treenode_segment_grow) }
    >
      <div className={ styles.kt_input_wrapper }>
        <input
          type='text'
          className={ styles.kt_input_box }
          autoFocus={ true }
          onBlur = { blurHandler }
          value = { value }
          onChange = { changeHandler}
          onKeyDown = { keydownHandler }
          />
      </div>
    </div>;
  }
  return <div
    className={ cls(styles.kt_treenode_segment, styles.kt_treenode_displayname) }
  >
    { node.name || 'UNKONW' }
  </div>;
};

const renderStatusTail = (node: any) => {
  return <div className={ cls(styles.kt_treenode_segment, styles.kt_treenode_tail) }></div>;
};

const renderDescription = (node: any) => {
  return <div className={ cls(styles.kt_treenode_segment_grow, styles.kt_treenode_description) }>{ node.description || '' }</div>;
};

const renderFolderToggle = <T extends ExpandableTreeNode>(node: T) => {
  return <div
    className={ cls(
      styles.kt_treenode_segment,
      styles.kt_expansion_toggle,
      {[`${styles.kt_mod_collapsed}`]: !node.expanded},
    )}
  >
  </div>;
};

export const TreeContainerNode = (
  {
    node,
    leftPadding,
    onSelect,
    onContextMenu,
    onDragStart,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDragEnd,
    onDrag,
    onDrop,
    onChange,
    draggable,
    isEdited,
    actions = [],
    commandActuator,
  }: TreeNodeProps,
) => {
  const FileTreeNodeWrapperStyle = {
    position: 'absolute',
    width: '100%',
    height: '22px',
    left: '0',
    opacity: isEdited && !node.filestat.isTemporaryFile ? .3 : 1,
    top: `${node.order * 22}px`,
  } as React.CSSProperties;

  const FileTreeNodeStyle = {
    paddingLeft: `${10 + node.depth * (leftPadding || 0) }px`,
  } as React.CSSProperties;

  const selectHandler = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (isEdited) {
      return ;
    }
    onSelect(node, event);
  };

  const contextMenuHandler = (event) => {
    event.stopPropagation();
    event.preventDefault();
    if (isEdited) {
      return ;
    }
    onContextMenu(node, event);
  };

  const dragStartHandler = (event) => {
    event.stopPropagation();
    if (isEdited) {
      event.preventDefault();
      return ;
    }
    onDragStart(node, event);
  };

  const dragEnterHandler = (event) => {
    onDragEnter(node, event);
  };

  const dragOverHandler = (event) => {
    onDragOver(node, event);
  };

  const dragLeaveHandler = (event) => {
    onDragLeave(node, event);
  };

  const dragEndHandler = (event) => {
    onDragEnd(node, event);
  };

  const dragHandler = (event) => {
    if (isEdited) {
      event.stopPropagation();
      event.preventDefault();
      return ;
    }
    onDrag(node, event);
  };

  const dropHandler = (event) => {
    if (isEdited) {
      event.stopPropagation();
      event.preventDefault();
      return ;
    }
    onDrop(node, event);
  };

  const getNodeTooltip = (node: TreeNode): string | undefined => {
    if (node.tooltip) {
      return node.tooltip;
    }
    if (node.uri) {
      const uri = node.uri.toString();
      return uri ? uri : undefined;
    }
  };

  const renderTreeNodeActions = (node: TreeNode, actions: TreeViewAction[], commandActuator: any) => {
    return actions.map((action: TreeViewAction) => {
      const clickHandler = (event: React.MouseEvent) => {
        event.stopPropagation();
        event.preventDefault();
        commandActuator(action.command, action.paramsKey ? node[action.paramsKey] : node.uri);
      };
      const icon = typeof action.icon === 'string' ? action.icon : action.icon.dark;
      return <i key={ action.title } className={ icon } title={ action.title } onClick={ clickHandler }></i>;
    });
  };

  const renderTreeNodeLeftActions = (node: TreeNode, actions: TreeViewAction[], commandActuator: any) => {

    return <div className={styles.left_actions}>
      { renderTreeNodeActions(node, actions, commandActuator) }
    </div>;

  };

  const renderTreeNodeRightActions = (node: TreeNode, actions: TreeViewAction[], commandActuator: any) => {
    console.log(actions);
    return <div className={styles.right_actions}>
      { renderTreeNodeActions(node, actions, commandActuator) }
    </div>;

  };

  const renderActionBar = (node: TreeNode, actions: TreeViewAction[], commandActuator: any) => {
    const treeNodeLeftActions: TreeViewAction[] = [];
    const treeNodeRightActions: TreeViewAction[] = [];
    const treeContainerActions: TreeViewAction[] = [];
    for (const action of actions) {
      switch (action.location) {
        case TreeViewActionTypes.TreeNode_Left:
          treeNodeLeftActions.push(action);
          break;
        case TreeViewActionTypes.TreeNode_Right:
          treeNodeRightActions.push(action);
          break;
        case TreeViewActionTypes.TreeContainer:
          treeContainerActions.push(action);
          break;
        default:
          break;
      }
    }
    return <div className={cls(styles.kt_treenode_action_bar)}>
      { renderTreeNodeLeftActions(node, treeNodeLeftActions, commandActuator) }
      { renderTreeNodeRightActions(node, treeNodeRightActions, commandActuator) }
    </div>;
  };

  return (
    <div
      key={ node.id }
      style={ FileTreeNodeWrapperStyle }
      title = { getNodeTooltip(node) }
      draggable={ draggable }
      onDragStart={ dragStartHandler }
      onDragEnter={ dragEnterHandler }
      onDragOver={ dragOverHandler }
      onDragLeave={ dragLeaveHandler }
      onDragEnd={ dragEndHandler }
      onDrag={ dragHandler }
      onDrop={ dropHandler }
      onContextMenu={ contextMenuHandler }
      onClick={ selectHandler }
      >
      <div
        className={ cls(styles.kt_treenode, node.filestat && node.filestat.isSymbolicLink ? styles.kt_treenode_symbolic_link : '', SelectableTreeNode.hasFocus(node) ? styles.kt_mod_focused : SelectableTreeNode.isSelected(node) ? styles.kt_mod_selected : '') }
        style={ FileTreeNodeStyle }
      >
        <div className={ styles.kt_treenode_content }>
          { renderActionBar(node, actions, commandActuator) }
          { ExpandableTreeNode.is(node) && renderFolderToggle(node) }
          { renderIcon(node) }
          { renderDisplayName(node, onChange) }
          { renderDescription(node) }
          { renderStatusTail(node) }
        </div>
      </div>
    </div>
  );
};
