"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { PaidFeaturesAlert } from "@app/components/PaidFeaturesAlert";
import ConfirmDeleteDialog from "@app/components/ConfirmDeleteDialog";
import { tierMatrix, TierFeature } from "@server/lib/billing/tierMatrix";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import {
    Credenza,
    CredenzaBody,
    CredenzaClose,
    CredenzaContent,
    CredenzaDescription,
    CredenzaFooter,
    CredenzaHeader,
    CredenzaTitle
} from "@app/components/Credenza";
import { Button } from "@app/components/ui/button";
import { Switch } from "@app/components/ui/switch";
import { Globe, MoreHorizontal, Plus } from "lucide-react";
import { AxiosResponse } from "axios";
import { build } from "@server/build";
import Image from "next/image";
import { StrategySelect, StrategyOption } from "@app/components/StrategySelect";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@app/components/ui/dropdown-menu";
import {
    Destination,
    HttpDestinationCredenza,
    parseHttpConfig
} from "@app/components/HttpDestinationCredenza";

// ── Re-export Destination so the rest of the file can use it ──────────────────

interface ListDestinationsResponse {
    destinations: Destination[];
    pagination: {
        total: number;
        limit: number;
        offset: number;
    };
}

// ── Destination card ───────────────────────────────────────────────────────────

interface DestinationCardProps {
    destination: Destination;
    onToggle: (id: number, enabled: boolean) => void;
    onEdit: (destination: Destination) => void;
    onDelete: (destination: Destination) => void;
    isToggling: boolean;
    disabled?: boolean;
}

function DestinationCard({
    destination,
    onToggle,
    onEdit,
    onDelete,
    isToggling,
    disabled = false
}: DestinationCardProps) {
    const cfg = parseHttpConfig(destination.config);

    return (
        <div className="relative flex flex-col rounded-lg border bg-card text-card-foreground p-5 gap-3">
            {/* Top row: icon + name/type + toggle */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    {/* Squirkle icon: gray outer → white inner → black globe */}
                    <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-2xl bg-muted">
                        <div className="flex items-center justify-center w-6 h-6 rounded-xl bg-white shadow-sm">
                            <Globe className="h-3.5 w-3.5 text-black" />
                        </div>
                    </div>
                    <div className="min-w-0">
                        <p className="font-semibold text-sm leading-tight truncate">
                            {cfg.name || "Unnamed destination"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                            HTTP
                        </p>
                    </div>
                </div>
                <Switch
                    checked={destination.enabled}
                    onCheckedChange={(v) =>
                        onToggle(destination.destinationId, v)
                    }
                    disabled={isToggling || disabled}
                    className="shrink-0 mt-0.5"
                />
            </div>

            {/* URL preview */}
            <p className="text-xs text-muted-foreground truncate">
                {cfg.url || (
                    <span className="italic">No URL configured</span>
                )}
            </p>

            {/* Footer: edit button + three-dots menu */}
            <div className="mt-auto pt-5 flex gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(destination)}
                    disabled={disabled}
                    className="flex-1"
                >
                    Edit
                </Button>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            disabled={disabled}
                        >
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => onDelete(destination)}
                        >
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}

// ── Add destination card ───────────────────────────────────────────────────────

function AddDestinationCard({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-transparent transition-colors p-5 min-h-35 w-full text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 cursor-pointer"
        >
            <div className="flex flex-col items-center gap-2">
                <div className="flex items-center justify-center w-9 h-9 rounded-md border-2 border-dashed border-current">
                    <Plus className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium">Add Destination</span>
            </div>
        </button>
    );
}

// ── Destination type picker ────────────────────────────────────────────────────

type DestinationType = "http" | "s3" | "datadog";

const destinationTypeOptions: ReadonlyArray<StrategyOption<DestinationType>> = [
    {
        id: "http",
        title: "HTTP Webhook",
        description:
            "Send events to any HTTP endpoint with flexible authentication and templating.",
        icon: <Globe className="h-6 w-6" />
    },
    {
        id: "s3",
        title: "Amazon S3",
        description:
            "Stream events to an S3-compatible object storage bucket. Coming soon.",
        disabled: true,
        icon: (
            <Image
                src="/third-party/s3.png"
                alt="Amazon S3"
                width={24}
                height={24}
                className="rounded-sm"
            />
        )
    },
    {
        id: "datadog",
        title: "Datadog",
        description:
            "Forward events directly to your Datadog account. Coming soon.",
        disabled: true,
        icon: (
            <Image
                src="/third-party/dd.png"
                alt="Datadog"
                width={24}
                height={24}
                className="rounded-sm"
            />
        )
    }
];

interface DestinationTypePickerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (type: DestinationType) => void;
    isPaywalled?: boolean;
}

function DestinationTypePicker({
    open,
    onOpenChange,
    onSelect,
    isPaywalled = false
}: DestinationTypePickerProps) {
    const [selected, setSelected] = useState<DestinationType>("http");

    useEffect(() => {
        if (open) setSelected("http");
    }, [open]);

    return (
        <Credenza open={open} onOpenChange={onOpenChange}>
            <CredenzaContent className="sm:max-w-lg">
                <CredenzaHeader>
                    <CredenzaTitle>Add Destination</CredenzaTitle>
                    <CredenzaDescription>
                        Choose a destination type to get started.
                    </CredenzaDescription>
                </CredenzaHeader>
                <CredenzaBody>
                    {isPaywalled && (
                        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
                            Upgrade to an enterprise plan to configure event
                            streaming destinations.
                        </div>
                    )}
                    <div className={isPaywalled ? "pointer-events-none opacity-50" : ""}>
                        <StrategySelect
                            options={destinationTypeOptions}
                            value={selected}
                            onChange={setSelected}
                            cols={1}
                        />
                    </div>
                </CredenzaBody>
                <CredenzaFooter>
                    <CredenzaClose asChild>
                        <Button variant="outline">Cancel</Button>
                    </CredenzaClose>
                    <Button
                        onClick={() => onSelect(selected)}
                        disabled={isPaywalled}
                    >
                        Continue
                    </Button>
                </CredenzaFooter>
            </CredenzaContent>
        </Credenza>
    );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function StreamingDestinationsPage() {
    const { orgId } = useParams() as { orgId: string };
    const api = createApiClient(useEnvContext());
    const { isPaidUser } = usePaidStatus();
    const isEnterprise = isPaidUser(tierMatrix[TierFeature.SIEM]);

    const [destinations, setDestinations] = useState<Destination[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [typePickerOpen, setTypePickerOpen] = useState(false);
    const [editingDestination, setEditingDestination] =
        useState<Destination | null>(null);
    const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());

    // Delete state
    const [deleteTarget, setDeleteTarget] = useState<Destination | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const loadDestinations = useCallback(async () => {
        if (build == "oss") {
            setDestinations([]);
            setLoading(false);
            return;
        }
        try {
            const res = await api.get<AxiosResponse<ListDestinationsResponse>>(
                `/org/${orgId}/event-streaming-destinations`
            );
            setDestinations(res.data.data.destinations ?? []);
        } catch (e) {
            toast({
                variant: "destructive",
                title: "Failed to load destinations",
                description: formatAxiosError(
                    e,
                    "An unexpected error occurred."
                )
            });
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    useEffect(() => {
        loadDestinations();
    }, [loadDestinations]);

    const handleToggle = async (destinationId: number, enabled: boolean) => {
        // Optimistic update
        setDestinations((prev) =>
            prev.map((d) =>
                d.destinationId === destinationId ? { ...d, enabled } : d
            )
        );
        setTogglingIds((prev) => new Set(prev).add(destinationId));

        try {
            await api.post(
                `/org/${orgId}/event-streaming-destination/${destinationId}`,
                { enabled }
            );
        } catch (e) {
            // Revert on failure
            setDestinations((prev) =>
                prev.map((d) =>
                    d.destinationId === destinationId
                        ? { ...d, enabled: !enabled }
                        : d
                )
            );
            toast({
                variant: "destructive",
                title: "Failed to update destination",
                description: formatAxiosError(
                    e,
                    "An unexpected error occurred."
                )
            });
        } finally {
            setTogglingIds((prev) => {
                const next = new Set(prev);
                next.delete(destinationId);
                return next;
            });
        }
    };

    const handleDeleteCard = (destination: Destination) => {
        setDeleteTarget(destination);
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await api.delete(
                `/org/${orgId}/event-streaming-destination/${deleteTarget.destinationId}`
            );
            toast({ title: "Destination deleted successfully" });
            setDeleteDialogOpen(false);
            setDeleteTarget(null);
            loadDestinations();
        } catch (e) {
            toast({
                variant: "destructive",
                title: "Failed to delete destination",
                description: formatAxiosError(
                    e,
                    "An unexpected error occurred."
                )
            });
        } finally {
            setDeleting(false);
        }
    };

    const openCreate = () => {
        setTypePickerOpen(true);
    };

    const handleTypePicked = (_type: DestinationType) => {
        setTypePickerOpen(false);
        setEditingDestination(null);
        setModalOpen(true);
    };

    const openEdit = (destination: Destination) => {
        setEditingDestination(destination);
        setModalOpen(true);
    };

    return (
        <>
            <SettingsSectionTitle
                title="Event Streaming"
                description="Stream events from your organization to external destinations in real time."
            />

            <PaidFeaturesAlert tiers={tierMatrix[TierFeature.SIEM]} />

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div
                            key={i}
                            className="rounded-lg border bg-card p-5 min-h-36 animate-pulse"
                        />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {destinations.map((dest) => (
                        <DestinationCard
                            key={dest.destinationId}
                            destination={dest}
                            onToggle={handleToggle}
                            onEdit={openEdit}
                            onDelete={handleDeleteCard}
                            isToggling={togglingIds.has(dest.destinationId)}
                            disabled={!isEnterprise}
                        />
                    ))}
                    {/* Add card is always clickable — paywall is enforced inside the picker */}
                    <AddDestinationCard onClick={openCreate} />
                </div>
            )}

            <DestinationTypePicker
                open={typePickerOpen}
                onOpenChange={setTypePickerOpen}
                onSelect={handleTypePicked}
                isPaywalled={!isEnterprise}
            />

            <HttpDestinationCredenza
                open={modalOpen}
                onOpenChange={setModalOpen}
                editing={editingDestination}
                orgId={orgId}
                onSaved={loadDestinations}
            />

            {deleteTarget && (
                <ConfirmDeleteDialog
                    open={deleteDialogOpen}
                    setOpen={(v) => {
                        setDeleteDialogOpen(v);
                        if (!v) setDeleteTarget(null);
                    }}
                    string={
                        parseHttpConfig(deleteTarget.config).name || "delete"
                    }
                    title="Delete Destination"
                    dialog={
                        <p className="text-sm text-muted-foreground">
                            Are you sure you want to delete{" "}
                            <span className="font-semibold text-foreground">
                                {parseHttpConfig(deleteTarget.config).name ||
                                    "this destination"}
                            </span>
                            ? All configuration will be permanently removed.
                        </p>
                    }
                    buttonText="Delete Destination"
                    onConfirm={handleDeleteConfirm}
                />
            )}
        </>
    );
}
