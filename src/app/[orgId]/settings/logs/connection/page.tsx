"use client";
import { ColumnFilter } from "@app/components/ColumnFilter";
import { DateTimeValue } from "@app/components/DateTimePicker";
import { LogDataTable } from "@app/components/LogDataTable";
import { PaidFeaturesAlert } from "@app/components/PaidFeaturesAlert";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { useStoredPageSize } from "@app/hooks/useStoredPageSize";
import { toast } from "@app/hooks/useToast";
import { createApiClient } from "@app/lib/api";
import { getSevenDaysAgo } from "@app/lib/getSevenDaysAgo";
import { build } from "@server/build";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import { ColumnDef } from "@tanstack/react-table";
import axios from "axios";
import { Cable, Monitor, Server } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

function formatBytes(bytes: number | null): string {
    if (bytes === null || bytes === undefined) return "—";
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDuration(startedAt: number, endedAt: number | null): string {
    if (endedAt === null || endedAt === undefined) return "Active";
    const durationSec = endedAt - startedAt;
    if (durationSec < 0) return "—";
    if (durationSec < 60) return `${durationSec}s`;
    if (durationSec < 3600) {
        const m = Math.floor(durationSec / 60);
        const s = durationSec % 60;
        return `${m}m ${s}s`;
    }
    const h = Math.floor(durationSec / 3600);
    const m = Math.floor((durationSec % 3600) / 60);
    return `${h}h ${m}m`;
}

export default function ConnectionLogsPage() {
    const router = useRouter();
    const api = createApiClient(useEnvContext());
    const t = useTranslations();
    const { orgId } = useParams();
    const searchParams = useSearchParams();

    const { isPaidUser } = usePaidStatus();

    const [rows, setRows] = useState<any[]>([]);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isExporting, startTransition] = useTransition();
    const [filterAttributes, setFilterAttributes] = useState<{
        protocols: string[];
    }>({
        protocols: []
    });

    // Filter states - unified object for all filters
    const [filters, setFilters] = useState<{
        protocol?: string;
    }>({
        protocol: searchParams.get("protocol") || undefined
    });

    // Pagination state
    const [totalCount, setTotalCount] = useState<number>(0);
    const [currentPage, setCurrentPage] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(false);

    // Initialize page size from storage or default
    const [pageSize, setPageSize] = useStoredPageSize(
        "connection-audit-logs",
        20
    );

    // Set default date range to last 7 days
    const getDefaultDateRange = () => {
        // if the time is in the url params, use that instead
        const startParam = searchParams.get("start");
        const endParam = searchParams.get("end");
        if (startParam && endParam) {
            return {
                startDate: {
                    date: new Date(startParam)
                },
                endDate: {
                    date: new Date(endParam)
                }
            };
        }

        const now = new Date();
        const lastWeek = getSevenDaysAgo();

        return {
            startDate: {
                date: lastWeek
            },
            endDate: {
                date: now
            }
        };
    };

    const [dateRange, setDateRange] = useState<{
        startDate: DateTimeValue;
        endDate: DateTimeValue;
    }>(getDefaultDateRange());

    // Trigger search with default values on component mount
    useEffect(() => {
        if (build === "oss") {
            return;
        }
        const defaultRange = getDefaultDateRange();
        queryDateTime(
            defaultRange.startDate,
            defaultRange.endDate,
            0,
            pageSize
        );
    }, [orgId]); // Re-run if orgId changes

    const handleDateRangeChange = (
        startDate: DateTimeValue,
        endDate: DateTimeValue
    ) => {
        setDateRange({ startDate, endDate });
        setCurrentPage(0); // Reset to first page when filtering
        // put the search params in the url for the time
        updateUrlParamsForAllFilters({
            start: startDate.date?.toISOString() || "",
            end: endDate.date?.toISOString() || ""
        });

        queryDateTime(startDate, endDate, 0, pageSize);
    };

    // Handle page changes
    const handlePageChange = (newPage: number) => {
        setCurrentPage(newPage);
        queryDateTime(
            dateRange.startDate,
            dateRange.endDate,
            newPage,
            pageSize
        );
    };

    // Handle page size changes
    const handlePageSizeChange = (newPageSize: number) => {
        setPageSize(newPageSize);
        setCurrentPage(0); // Reset to first page when changing page size
        queryDateTime(dateRange.startDate, dateRange.endDate, 0, newPageSize);
    };

    // Handle filter changes generically
    const handleFilterChange = (
        filterType: keyof typeof filters,
        value: string | undefined
    ) => {
        // Create new filters object with updated value
        const newFilters = {
            ...filters,
            [filterType]: value
        };

        setFilters(newFilters);
        setCurrentPage(0); // Reset to first page when filtering

        // Update URL params
        updateUrlParamsForAllFilters(newFilters);

        // Trigger new query with updated filters (pass directly to avoid async state issues)
        queryDateTime(
            dateRange.startDate,
            dateRange.endDate,
            0,
            pageSize,
            newFilters
        );
    };

    const updateUrlParamsForAllFilters = (
        newFilters:
            | typeof filters
            | {
                  start: string;
                  end: string;
              }
    ) => {
        const params = new URLSearchParams(searchParams);
        Object.entries(newFilters).forEach(([key, value]) => {
            if (value) {
                params.set(key, value);
            } else {
                params.delete(key);
            }
        });
        router.replace(`?${params.toString()}`, { scroll: false });
    };

    const queryDateTime = async (
        startDate: DateTimeValue,
        endDate: DateTimeValue,
        page: number = currentPage,
        size: number = pageSize,
        filtersParam?: {
            protocol?: string;
        }
    ) => {
        console.log("Date range changed:", { startDate, endDate, page, size });
        if (!isPaidUser(tierMatrix.connectionLogs)) {
            console.log(
                "Access denied: subscription inactive or license locked"
            );
            return;
        }
        setIsLoading(true);

        try {
            // Use the provided filters or fall back to current state
            const activeFilters = filtersParam || filters;

            // Convert the date/time values to API parameters
            const params: any = {
                limit: size,
                offset: page * size,
                ...activeFilters
            };

            if (startDate?.date) {
                const startDateTime = new Date(startDate.date);
                if (startDate.time) {
                    const [hours, minutes, seconds] = startDate.time
                        .split(":")
                        .map(Number);
                    startDateTime.setHours(hours, minutes, seconds || 0);
                }
                params.timeStart = startDateTime.toISOString();
            }

            if (endDate?.date) {
                const endDateTime = new Date(endDate.date);
                if (endDate.time) {
                    const [hours, minutes, seconds] = endDate.time
                        .split(":")
                        .map(Number);
                    endDateTime.setHours(hours, minutes, seconds || 0);
                } else {
                    // If no time is specified, set to NOW
                    const now = new Date();
                    endDateTime.setHours(
                        now.getHours(),
                        now.getMinutes(),
                        now.getSeconds(),
                        now.getMilliseconds()
                    );
                }
                params.timeEnd = endDateTime.toISOString();
            }

            const res = await api.get(`/org/${orgId}/logs/connection`, {
                params
            });
            if (res.status === 200) {
                setRows(res.data.data.log || []);
                setTotalCount(res.data.data.pagination?.total || 0);
                setFilterAttributes(res.data.data.filterAttributes);
                console.log("Fetched connection logs:", res.data);
            }
        } catch (error) {
            toast({
                title: t("error"),
                description: t("Failed to filter logs"),
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    const refreshData = async () => {
        console.log("Data refreshed");
        setIsRefreshing(true);
        try {
            // Refresh data with current date range and pagination
            await queryDateTime(
                dateRange.startDate,
                dateRange.endDate,
                currentPage,
                pageSize
            );
        } catch (error) {
            toast({
                title: t("error"),
                description: t("refreshError"),
                variant: "destructive"
            });
        } finally {
            setIsRefreshing(false);
        }
    };

    const exportData = async () => {
        try {
            // Prepare query params for export
            const params: any = {
                timeStart: dateRange.startDate?.date
                    ? new Date(dateRange.startDate.date).toISOString()
                    : undefined,
                timeEnd: dateRange.endDate?.date
                    ? new Date(dateRange.endDate.date).toISOString()
                    : undefined,
                ...filters
            };

            const response = await api.get(
                `/org/${orgId}/logs/connection/export`,
                {
                    responseType: "blob",
                    params
                }
            );

            // Create a URL for the blob and trigger a download
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement("a");
            link.href = url;
            const epoch = Math.floor(Date.now() / 1000);
            link.setAttribute(
                "download",
                `connection-audit-logs-${orgId}-${epoch}.csv`
            );
            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
        } catch (error) {
            let apiErrorMessage: string | null = null;
            if (axios.isAxiosError(error) && error.response) {
                const data = error.response.data;

                if (data instanceof Blob && data.type === "application/json") {
                    // Parse the Blob as JSON
                    const text = await data.text();
                    const errorData = JSON.parse(text);
                    apiErrorMessage = errorData.message;
                }
            }
            toast({
                title: t("error"),
                description: apiErrorMessage ?? t("exportError"),
                variant: "destructive"
            });
        }
    };

    const columns: ColumnDef<any>[] = [
        {
            accessorKey: "startedAt",
            header: ({ column }) => {
                return t("timestamp");
            },
            cell: ({ row }) => {
                return (
                    <div className="whitespace-nowrap">
                        {new Date(
                            row.original.startedAt * 1000
                        ).toLocaleString()}
                    </div>
                );
            }
        },
        {
            accessorKey: "protocol",
            header: ({ column }) => {
                return (
                    <div className="flex items-center gap-2">
                        <span>{t("protocol")}</span>
                        <ColumnFilter
                            options={filterAttributes.protocols.map(
                                (protocol) => ({
                                    label: protocol.toUpperCase(),
                                    value: protocol
                                })
                            )}
                            selectedValue={filters.protocol}
                            onValueChange={(value) =>
                                handleFilterChange("protocol", value)
                            }
                            searchPlaceholder="Search..."
                            emptyMessage="None found"
                        />
                    </div>
                );
            },
            cell: ({ row }) => {
                return (
                    <span className="whitespace-nowrap font-mono text-xs">
                        {row.original.protocol?.toUpperCase()}
                    </span>
                );
            }
        },
        {
            accessorKey: "resourceName",
            header: ({ column }) => {
                return t("resource");
            },
            cell: ({ row }) => {
                return (
                    <span className="whitespace-nowrap">
                        {row.original.resourceName ?? "—"}
                    </span>
                );
            }
        },
        {
            accessorKey: "sourceAddr",
            header: ({ column }) => {
                return t("sourceAddress");
            },
            cell: ({ row }) => {
                return (
                    <span className="whitespace-nowrap font-mono text-xs">
                        {row.original.sourceAddr}
                    </span>
                );
            }
        },
        {
            accessorKey: "destAddr",
            header: ({ column }) => {
                return t("destinationAddress");
            },
            cell: ({ row }) => {
                return (
                    <span className="whitespace-nowrap font-mono text-xs">
                        {row.original.destAddr}
                    </span>
                );
            }
        },
        {
            accessorKey: "duration",
            header: ({ column }) => {
                return t("duration");
            },
            cell: ({ row }) => {
                return (
                    <span className="whitespace-nowrap">
                        {formatDuration(
                            row.original.startedAt,
                            row.original.endedAt
                        )}
                    </span>
                );
            }
        }
    ];

    const renderExpandedRow = (row: any) => {
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div className="space-y-2">
                        <div className="flex items-center gap-1 font-semibold text-sm mb-1">
                            <Cable className="h-4 w-4" />
                            Connection Details
                        </div>
                        <div>
                            <strong>Session ID:</strong>{" "}
                            <span className="font-mono">
                                {row.sessionId ?? "—"}
                            </span>
                        </div>
                        <div>
                            <strong>Protocol:</strong>{" "}
                            {row.protocol?.toUpperCase() ?? "—"}
                        </div>
                        <div>
                            <strong>Source:</strong>{" "}
                            <span className="font-mono">
                                {row.sourceAddr ?? "—"}
                            </span>
                        </div>
                        <div>
                            <strong>Destination:</strong>{" "}
                            <span className="font-mono">
                                {row.destAddr ?? "—"}
                            </span>
                        </div>
                        <div>
                            <strong>Started At:</strong>{" "}
                            {row.startedAt
                                ? new Date(
                                      row.startedAt * 1000
                                  ).toLocaleString()
                                : "—"}
                        </div>
                        <div>
                            <strong>Ended At:</strong>{" "}
                            {row.endedAt
                                ? new Date(
                                      row.endedAt * 1000
                                  ).toLocaleString()
                                : "Active"}
                        </div>
                        <div>
                            <strong>Duration:</strong>{" "}
                            {formatDuration(row.startedAt, row.endedAt)}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center gap-1 font-semibold text-sm mb-1">
                            <Server className="h-4 w-4" />
                            Resource & Site
                        </div>
                        <div>
                            <strong>Resource:</strong>{" "}
                            {row.resourceName ?? "—"}
                            {row.resourceNiceId && (
                                <span className="text-muted-foreground ml-1">
                                    ({row.resourceNiceId})
                                </span>
                            )}
                        </div>
                        <div>
                            <strong>Site:</strong> {row.siteName ?? "—"}
                            {row.siteNiceId && (
                                <span className="text-muted-foreground ml-1">
                                    ({row.siteNiceId})
                                </span>
                            )}
                        </div>
                        <div>
                            <strong>Site ID:</strong> {row.siteId ?? "—"}
                        </div>
                        <div>
                            <strong>Resource ID:</strong>{" "}
                            {row.siteResourceId ?? "—"}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center gap-1 font-semibold text-sm mb-1">
                            <Monitor className="h-4 w-4" />
                            Client & Transfer
                        </div>
                        <div>
                            <strong>Client:</strong> {row.clientName ?? "—"}
                            {row.clientId && (
                                <span className="text-muted-foreground ml-1">
                                    (ID: {row.clientId})
                                </span>
                            )}
                        </div>
                        <div>
                            <strong>User ID:</strong> {row.userId ?? "—"}
                        </div>
                        <div>
                            <strong>Bytes Sent (TX):</strong>{" "}
                            {formatBytes(row.bytesTx)}
                        </div>
                        <div>
                            <strong>Bytes Received (RX):</strong>{" "}
                            {formatBytes(row.bytesRx)}
                        </div>
                        <div>
                            <strong>Total Transfer:</strong>{" "}
                            {formatBytes(
                                (row.bytesTx ?? 0) + (row.bytesRx ?? 0)
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <>
            <SettingsSectionTitle
                title={t("connectionLogs")}
                description={t("connectionLogsDescription")}
            />

            <PaidFeaturesAlert tiers={tierMatrix.connectionLogs} />

            <LogDataTable
                columns={columns}
                data={rows}
                title={t("connectionLogs")}
                searchPlaceholder={t("searchLogs")}
                searchColumn="protocol"
                onRefresh={refreshData}
                isRefreshing={isRefreshing}
                onExport={() => startTransition(exportData)}
                isExporting={isExporting}
                onDateRangeChange={handleDateRangeChange}
                dateRange={{
                    start: dateRange.startDate,
                    end: dateRange.endDate
                }}
                defaultSort={{
                    id: "startedAt",
                    desc: true
                }}
                // Server-side pagination props
                totalCount={totalCount}
                currentPage={currentPage}
                pageSize={pageSize}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                isLoading={isLoading}
                // Row expansion props
                expandable={true}
                renderExpandedRow={renderExpandedRow}
                disabled={
                    !isPaidUser(tierMatrix.connectionLogs) || build === "oss"
                }
            />
        </>
    );
}