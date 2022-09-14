declare module 'vscode' {
  // #endregion

  // #region @jrieken -> exclusive document filters
  export interface DocumentFilter {
    readonly exclusive?: boolean;
  }

  // #region https://github.com/microsoft/vscode/issues/120173
  /**
   * The object describing the properties of the workspace trust request
   */
  export interface WorkspaceTrustRequestOptions {
    /**
     * Custom message describing the user action that requires workspace
     * trust. If omitted, a generic message will be displayed in the workspace
     * trust request dialog.
     */
    readonly message?: string;
  }
  export namespace workspace {
    /**
     * Prompt the user to chose whether to trust the current workspace
     * @param options Optional object describing the properties of the
     * workspace trust request.
     */
    export function requestWorkspaceTrust(options?: WorkspaceTrustRequestOptions): Thenable<boolean | undefined>;
  }
  // #endregion
}
