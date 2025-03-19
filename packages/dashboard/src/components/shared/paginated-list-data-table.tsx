import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header.js';
import { DataTable } from '@/components/data-table/data-table.js';
import { useComponentRegistry } from '@/framework/component-registry/component-registry.js';
import {
    FieldInfo,
    getQueryName,
    getTypeFieldInfo,
    getObjectPathToPaginatedList,
} from '@/framework/document-introspection/get-document-structure.js';
import { useListQueryFields } from '@/framework/document-introspection/hooks.js';
import { api } from '@/graphql/api.js';
import { useDebounce } from 'use-debounce';
import { useQueryClient } from '@tanstack/react-query';

import { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';
import {
    ColumnFiltersState,
    ColumnSort,
    createColumnHelper,
    SortingState,
    Table,
} from '@tanstack/react-table';
import { AccessorKeyColumnDef, ColumnDef } from '@tanstack/table-core';
import { graphql, ResultOf } from '@/graphql/graphql.js';
import React, { useMemo } from 'react';
import { Delegate } from '@/framework/component-registry/delegate.js';

// Type that identifies a paginated list structure (has items array and totalItems)
type IsPaginatedList<T> = T extends { items: any[]; totalItems: number } ? true : false;

// Helper type to extract string keys from an object
type StringKeys<T> = T extends object ? Extract<keyof T, string> : never;

// Helper type to handle nullability
type NonNullable<T> = T extends null | undefined ? never : T;


// Non-recursive approach to find paginated list paths with max 2 levels
// Level 0: Direct top-level check
type Level0PaginatedLists<T> = T extends object
    ? IsPaginatedList<T> extends true
        ? ''
        : never
    : never;

// Level 1: One level deep
type Level1PaginatedLists<T> = T extends object
    ? {
          [K in StringKeys<T>]: NonNullable<T[K]> extends object
              ? IsPaginatedList<NonNullable<T[K]>> extends true
                  ? K
                  : never
              : never;
      }[StringKeys<T>]
    : never;

// Level 2: Two levels deep
type Level2PaginatedLists<T> = T extends object
    ? {
          [K1 in StringKeys<T>]: NonNullable<T[K1]> extends object
              ? {
                    [K2 in StringKeys<NonNullable<T[K1]>>]: NonNullable<NonNullable<T[K1]>[K2]> extends object
                        ? IsPaginatedList<NonNullable<NonNullable<T[K1]>[K2]>> extends true
                            ? `${K1}.${K2}`
                            : never
                        : never;
                }[StringKeys<NonNullable<T[K1]>>]
              : never;
      }[StringKeys<T>]
    : never;

// Combine all levels
type FindPaginatedListPaths<T> = 
    | Level0PaginatedLists<T>
    | Level1PaginatedLists<T> 
    | Level2PaginatedLists<T>;

// Extract all paths from a TypedDocumentNode
export type PaginatedListPaths<T extends TypedDocumentNode<any, any>> =
    FindPaginatedListPaths<ResultOf<T>> extends infer Paths ? (Paths extends '' ? never : Paths) : never;

export type PaginatedListItemFields<
    T extends TypedDocumentNode<any, any>,
    Path extends PaginatedListPaths<T> = PaginatedListPaths<T>,
> =
    // split the path by '.' if it exists
    Path extends `${infer First}.${infer Rest}`
        ? NonNullable<ResultOf<T>[First]>[Rest]['items'][number]
        : Path extends keyof ResultOf<T>
          ? ResultOf<T>[Path] extends { items: Array<infer Item> }
              ? ResultOf<T>[Path]['items'][number]
              : never
          : never;

export type PaginatedListKeys<
    T extends TypedDocumentNode<any, any>,
    Path extends PaginatedListPaths<T> = PaginatedListPaths<T>,
> = {
    [K in keyof PaginatedListItemFields<T, Path>]: K;
}[keyof PaginatedListItemFields<T, Path>];


export type CustomizeColumnConfig<T extends TypedDocumentNode<any, any>> = {
    [Key in keyof PaginatedListItemFields<T>]?: Partial<ColumnDef<any>>;
};

export type ListQueryShape = {
    [key: string]: {
        items: any[];
        totalItems: number;
    };
} | {
    [key: string]: {
        [key: string]: {
            items: any[];
            totalItems: number;
        };
    };
};

export type ListQueryOptionsShape = {
    options?: {
        skip?: number;
        take?: number;
        sort?: {
            [key: string]: 'ASC' | 'DESC';
        };
        filter?: any;
    };
    [key: string]: any;
};

export interface PaginatedListContext {
    refetchPaginatedList: () => void;
}

export const PaginatedListContext = React.createContext<PaginatedListContext | undefined>(undefined);

/**
 * @description
 * Returns the context for the paginated list data table. Must be used within a PaginatedListDataTable.
 *
 * @example
 * ```ts
 * const { refetchPaginatedList } = usePaginatedList();
 *
 * const mutation = useMutation({
 *     mutationFn: api.mutate(updateFacetValueDocument),
 *     onSuccess: () => {
 *         refetchPaginatedList();
 *     },
 * });
 * ```
 */
export function usePaginatedList() {
    const context = React.useContext(PaginatedListContext);
    if (!context) {
        throw new Error('usePaginatedList must be used within a PaginatedListDataTable');
    }
    return context;
}

export interface PaginatedListDataTableProps<
    T extends TypedDocumentNode<U, V>,
    U extends any,
    V extends ListQueryOptionsShape,
> {
    listQuery: T;
    pathToListQuery?: PaginatedListPaths<T>;
    transformVariables?: (variables: V) => V;
    customizeColumns?: CustomizeColumnConfig<T>;
    additionalColumns?: ColumnDef<any>[];
    defaultVisibility?: Partial<Record<keyof PaginatedListItemFields<T>, boolean>>;
    onSearchTermChange?: (searchTerm: string) => NonNullable<V['options']>['filter'];
    page: number;
    itemsPerPage: number;
    sorting: SortingState;
    columnFilters?: ColumnFiltersState;
    onPageChange: (table: Table<any>, page: number, perPage: number) => void;
    onSortChange: (table: Table<any>, sorting: SortingState) => void;
    onFilterChange: (table: Table<any>, filters: ColumnFiltersState) => void;
}

export function PaginatedListDataTable<
    T extends TypedDocumentNode<U, V>,
    U extends Record<string, any> = any,
    V extends ListQueryOptionsShape = {},
>({
    listQuery,
    transformVariables,
    customizeColumns,
    additionalColumns,
    defaultVisibility,
    onSearchTermChange,
    page,
    itemsPerPage,
    sorting,
    columnFilters,
    onPageChange,
    onSortChange,
    onFilterChange,
}: PaginatedListDataTableProps<T, U, V>) {
    const { getComponent } = useComponentRegistry();
    const [searchTerm, setSearchTerm] = React.useState<string>('');
    const [debouncedSearchTerm] = useDebounce(searchTerm, 500);
    const queryClient = useQueryClient();

    const sort = sorting?.reduce((acc: any, sort: ColumnSort) => {
        const direction = sort.desc ? 'DESC' : 'ASC';
        const field = sort.id;

        if (!field || !direction) {
            return acc;
        }
        return { ...acc, [field]: direction };
    }, {});

    const filter = columnFilters?.length
        ? { _and: columnFilters.map(f => ({ [f.id]: f.value })) }
        : undefined;

    const queryKey = ['PaginatedListDataTable', listQuery, page, itemsPerPage, sorting, filter];

    function refetchPaginatedList() {
        queryClient.invalidateQueries({ queryKey });
    }

    const { data } = useQuery({
        queryFn: () => {
            const searchFilter = onSearchTermChange ? onSearchTermChange(debouncedSearchTerm) : {};
            const mergedFilter = { ...filter, ...searchFilter };
            const variables = {
                options: {
                    take: itemsPerPage,
                    skip: (page - 1) * itemsPerPage,
                    sort,
                    filter: mergedFilter,
                },
            } as V;

            const transformedVariables = transformVariables ? transformVariables(variables) : variables;
            return api.query(listQuery, transformedVariables);
        },
        queryKey,
    });

    const fields = useListQueryFields(listQuery);
    const paginatedListObjectPath = getObjectPathToPaginatedList(listQuery);

    let listData = data as any;
    for (const path of paginatedListObjectPath) {
        listData = listData?.[path];
    }

    const columnHelper = createColumnHelper();

    const columns = useMemo(() => {
        const columnConfigs: Array<{ fieldInfo: FieldInfo; isCustomField: boolean }> = [];

        columnConfigs.push(
            ...fields // Filter out custom fields
                .filter(field => field.name !== 'customFields' && !field.type.endsWith('CustomFields'))
                .map(field => ({ fieldInfo: field, isCustomField: false })),
        );

        const customFieldColumn = fields.find(field => field.name === 'customFields');
        if (customFieldColumn && customFieldColumn.type !== 'JSON') {
            const customFieldFields = getTypeFieldInfo(customFieldColumn.type);
            columnConfigs.push(
                ...customFieldFields.map(field => ({ fieldInfo: field, isCustomField: true })),
            );
        }

        const queryBasedColumns = columnConfigs.map(({ fieldInfo, isCustomField }) => {
            const customConfig = customizeColumns?.[fieldInfo.name as keyof PaginatedListItemFields<T>] ?? {};
            const { header, ...customConfigRest } = customConfig;
            return columnHelper.accessor(fieldInfo.name, {
                meta: { fieldInfo, isCustomField },
                enableColumnFilter: fieldInfo.isScalar,
                enableSorting: fieldInfo.isScalar,
                cell: ({ cell, row }) => {
                    const value = !isCustomField
                        ? cell.getValue()
                        : (row.original as any)?.customFields?.[fieldInfo.name];
                    if (fieldInfo.list && Array.isArray(value)) {
                        return value.join(', ');
                    }
                    if (
                        (fieldInfo.type === 'DateTime' && typeof value === 'string') ||
                        value instanceof Date
                    ) {
                        return <Delegate component="dateTime.display" value={value} />;
                    }
                    if (fieldInfo.type === 'Boolean') {
                        return <Delegate component="boolean.display" value={value} />;
                    }
                    if (fieldInfo.type === 'Asset') {
                        return <Delegate component="asset.display" value={value} />;
                    }
                    if (value !== null && typeof value === 'object') {
                        return JSON.stringify(value);
                    }
                    return value;
                },
                header: headerContext => {
                    return (
                        <DataTableColumnHeader headerContext={headerContext} customConfig={customConfig} />
                    );
                },
                ...customConfigRest,
            });
        });

        const finalColumns: AccessorKeyColumnDef<unknown, never>[] = [...queryBasedColumns];

        for (const column of additionalColumns ?? []) {
            if (!column.id) {
                throw new Error('Column id is required');
            }
            finalColumns.push(columnHelper.accessor(column.id, column));
        }

        return finalColumns;
    }, [fields, customizeColumns]);

    const columnVisibility = getColumnVisibility(fields, defaultVisibility);

    return (
        <PaginatedListContext.Provider value={{ refetchPaginatedList }}>
            <DataTable
                columns={columns}
                data={listData?.items ?? []}
                page={page}
                itemsPerPage={itemsPerPage}
                sorting={sorting}
                columnFilters={columnFilters}
                totalItems={listData?.totalItems ?? 0}
                onPageChange={onPageChange}
                onSortChange={onSortChange}
                onFilterChange={onFilterChange}
                onSearchTermChange={onSearchTermChange ? term => setSearchTerm(term) : undefined}
                defaultColumnVisibility={columnVisibility}
            />
        </PaginatedListContext.Provider>
    );
}


/**
 * Returns the default column visibility configuration.
 */
function getColumnVisibility(
    fields: FieldInfo[],
    defaultVisibility?: Record<string, boolean | undefined>,
): Record<string, boolean> {
    const allDefaultsTrue = defaultVisibility && Object.values(defaultVisibility).every(v => v === true);
    const allDefaultsFalse = defaultVisibility && Object.values(defaultVisibility).every(v => v === false);
    return {
        id: false,
        createdAt: false,
        updatedAt: false,
        ...(allDefaultsTrue ? { ...Object.fromEntries(fields.map(f => [f.name, false])) } : {}),
        ...(allDefaultsFalse ? { ...Object.fromEntries(fields.map(f => [f.name, true])) } : {}),
        ...defaultVisibility,
    };
}
