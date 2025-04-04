/**
 * @description
 * The options for the {@link DefaultSchedulerPlugin}.
 *
 * @since 3.3.0
 * @docsCategory scheduled-tasks
 */
export interface DefaultSchedulerPluginOptions {
    /**
     * @description
     * The default timeout for scheduled tasks.
     *
     * @default 60_000ms
     */
    defaultTimeout?: string | number;
}
