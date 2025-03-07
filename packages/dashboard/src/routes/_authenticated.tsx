import { AppSidebar } from '@/components/app-sidebar.js';
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb.js';
import { Separator } from '@/components/ui/separator.js';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar.js';
import { createFileRoute, Link, Outlet, redirect, useRouterState } from '@tanstack/react-router';
import * as React from 'react';

export const AUTHENTICATED_ROUTE_PREFIX = '/_authenticated';

export const Route = createFileRoute(AUTHENTICATED_ROUTE_PREFIX)({
    beforeLoad: ({ context, location }) => {
        if (!context.auth.isAuthenticated) {
            throw redirect({
                to: '/login',
                search: {
                    redirect: location.href,
                },
            });
        }
    },
    loader: () => ({
        breadcrumb: 'Dashboard',
    }),
    component: AuthLayout,
});

function AuthLayout() {
    const matches = useRouterState({ select: s => s.matches });
    const breadcrumbs = matches
        .filter(match => match.loaderData?.breadcrumb)
        .map(({ pathname, loaderData }) => {
            return {
                title: loaderData.breadcrumb,
                path: pathname,
            };
        });
    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
                <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
                    <div className="flex items-center gap-2 px-4">
                        <SidebarTrigger className="-ml-1" />
                        <Separator orientation="vertical" className="mr-2 h-4" />
                        <Breadcrumb>
                            <BreadcrumbList>
                                {breadcrumbs.map(({ title, path }, index, arr) => (
                                    <>
                                        <BreadcrumbItem key={index} className="hidden md:block">
                                            <BreadcrumbLink asChild>
                                                <Link to={path}>{title}</Link>
                                            </BreadcrumbLink>
                                        </BreadcrumbItem>
                                        {index < arr.length - 1 && (
                                            <BreadcrumbSeparator className="hidden md:block" />
                                        )}
                                    </>
                                ))}
                            </BreadcrumbList>
                        </Breadcrumb>
                    </div>
                </header>
                <Outlet />
            </SidebarInset>
        </SidebarProvider>
    );
}
