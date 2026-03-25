"use client";

import {
    DataTable,
    ExtendedColumnDef
} from "@app/components/ui/data-table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@app/components/ui/dropdown-menu";
import { Button } from "@app/components/ui/button";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import CreateSiteProvisioningKeyCredenza from "@app/components/CreateSiteProvisioningKeyCredenza";
import ConfirmDeleteDialog from "@app/components/ConfirmDeleteDialog";
import { toast } from "@app/hooks/useToast";
import { formatAxiosError } from "@app/lib/api";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import moment from "moment";
import { useTranslations } from "next-intl";

export type SiteProvisioningKeyRow = {
    id: string;
    key: string;
    name: string;
    createdAt: string;
};

type SiteProvisioningKeysTableProps = {
    keys: SiteProvisioningKeyRow[];
    orgId: string;
};

export default function SiteProvisioningKeysTable({
    keys,
    orgId
}: SiteProvisioningKeysTableProps) {
    const router = useRouter();
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [selected, setSelected] = useState<SiteProvisioningKeyRow | null>(
        null
    );
    const [rows, setRows] = useState<SiteProvisioningKeyRow[]>(keys);
    const api = createApiClient(useEnvContext());
    const t = useTranslations();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);

    useEffect(() => {
        setRows(keys);
    }, [keys]);

    const refreshData = async () => {
        setIsRefreshing(true);
        try {
            await new Promise((resolve) => setTimeout(resolve, 200));
            router.refresh();
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

    const deleteKey = async (siteProvisioningKeyId: string) => {
        try {
            await api.delete(
                `/org/${orgId}/site-provisioning-key/${siteProvisioningKeyId}`
            );
            router.refresh();
            setIsDeleteModalOpen(false);
            setSelected(null);
            setRows((prev) => prev.filter((row) => row.id !== siteProvisioningKeyId));
        } catch (e) {
            console.error(t("provisioningKeysErrorDelete"), e);
            toast({
                variant: "destructive",
                title: t("provisioningKeysErrorDelete"),
                description: formatAxiosError(
                    e,
                    t("provisioningKeysErrorDeleteMessage")
                )
            });
            throw e;
        }
    };

    const columns: ExtendedColumnDef<SiteProvisioningKeyRow>[] = [
        {
            accessorKey: "name",
            enableHiding: false,
            friendlyName: t("name"),
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() =>
                            column.toggleSorting(column.getIsSorted() === "asc")
                        }
                    >
                        {t("name")}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                );
            }
        },
        {
            accessorKey: "key",
            friendlyName: t("key"),
            header: () => <span className="p-3">{t("key")}</span>,
            cell: ({ row }) => {
                const r = row.original;
                return <span className="font-mono">{r.key}</span>;
            }
        },
        {
            accessorKey: "createdAt",
            friendlyName: t("createdAt"),
            header: () => <span className="p-3">{t("createdAt")}</span>,
            cell: ({ row }) => {
                const r = row.original;
                return <span>{moment(r.createdAt).format("lll")}</span>;
            }
        },
        {
            id: "actions",
            enableHiding: false,
            header: () => <span className="p-3"></span>,
            cell: ({ row }) => {
                const r = row.original;
                return (
                    <div className="flex items-center gap-2 justify-end">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                    <span className="sr-only">
                                        {t("openMenu")}
                                    </span>
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                    onClick={() => {
                                        setSelected(r);
                                        setIsDeleteModalOpen(true);
                                    }}
                                >
                                    <span className="text-red-500">
                                        {t("delete")}
                                    </span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                );
            }
        }
    ];

    return (
        <>
            <CreateSiteProvisioningKeyCredenza
                open={createOpen}
                setOpen={setCreateOpen}
                orgId={orgId}
            />

            {selected && (
                <ConfirmDeleteDialog
                    open={isDeleteModalOpen}
                    setOpen={(val) => {
                        setIsDeleteModalOpen(val);
                        if (!val) {
                            setSelected(null);
                        }
                    }}
                    dialog={
                        <div className="space-y-2">
                            <p>{t("provisioningKeysQuestionRemove")}</p>
                            <p>{t("provisioningKeysMessageRemove")}</p>
                        </div>
                    }
                    buttonText={t("provisioningKeysDeleteConfirm")}
                    onConfirm={async () => deleteKey(selected.id)}
                    string={selected.name}
                    title={t("provisioningKeysDelete")}
                />
            )}

            <DataTable
                columns={columns}
                data={rows}
                persistPageSize="Org-provisioning-keys-table"
                title={t("provisioningKeys")}
                searchPlaceholder={t("searchProvisioningKeys")}
                searchColumn="name"
                onAdd={() => setCreateOpen(true)}
                onRefresh={refreshData}
                isRefreshing={isRefreshing}
                addButtonText={t("provisioningKeysAdd")}
                enableColumnVisibility={true}
                stickyLeftColumn="name"
                stickyRightColumn="actions"
            />
        </>
    );
}
