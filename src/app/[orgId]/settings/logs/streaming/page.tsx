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
import { Input } from "@app/components/ui/input";
import { Label } from "@app/components/ui/label";
import { Switch } from "@app/components/ui/switch";
import { HorizontalTabs } from "@app/components/HorizontalTabs";
import { RadioGroup, RadioGroupItem } from "@app/components/ui/radio-group";
import { Textarea } from "@app/components/ui/textarea";
import { Checkbox } from "@app/components/ui/checkbox";
import { Globe, Plus, X } from "lucide-react";
import { AxiosResponse } from "axios";
import { build } from "@server/build";
import Image from "next/image";
import { StrategySelect, StrategyOption } from "@app/components/StrategySelect";

// ── Types ──────────────────────────────────────────────────────────────────────

type AuthType = "none" | "bearer" | "basic" | "custom";

interface HttpConfig {
    name: string;
    url: string;
    authType: AuthType;
    bearerToken?: string;
    basicCredentials?: string;
    customHeaderName?: string;
    customHeaderValue?: string;
    headers: Array<{ key: string; value: string }>;
    useBodyTemplate: boolean;
    bodyTemplate?: string;
}

interface Destination {
    destinationId: number;
    orgId: string;
    type: string;
    config: string;
    enabled: boolean;
    sendAccessLogs: boolean;
    sendActionLogs: boolean;
    sendConnectionLogs: boolean;
    sendRequestLogs: boolean;
    createdAt: number;
    updatedAt: number;
}

interface ListDestinationsResponse {
    destinations: Destination[];
    pagination: {
        total: number;
        limit: number;
        offset: number;
    };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const defaultConfig = (): HttpConfig => ({
    name: "",
    url: "",
    authType: "none",
    bearerToken: "",
    basicCredentials: "",
    customHeaderName: "",
    customHeaderValue: "",
    headers: [],
    useBodyTemplate: false,
    bodyTemplate: ""
});

function parseConfig(raw: string): HttpConfig {
    try {
        return { ...defaultConfig(), ...JSON.parse(raw) };
    } catch {
        return defaultConfig();
    }
}

// ── Headers editor ─────────────────────────────────────────────────────────────

interface HeadersEditorProps {
    headers: Array<{ key: string; value: string }>;
    onChange: (headers: Array<{ key: string; value: string }>) => void;
}

function HeadersEditor({ headers, onChange }: HeadersEditorProps) {
    const addRow = () => onChange([...headers, { key: "", value: "" }]);

    const removeRow = (i: number) =>
        onChange(headers.filter((_, idx) => idx !== i));

    const updateRow = (
        i: number,
        field: "key" | "value",
        val: string
    ) => {
        const next = [...headers];
        next[i] = { ...next[i], [field]: val };
        onChange(next);
    };

    return (
        <div className="space-y-3">
            {headers.length === 0 && (
                <p className="text-xs text-muted-foreground">
                    No custom headers configured. Click "Add Header" to add one.
                </p>
            )}
            {headers.map((h, i) => (
                <div key={i} className="flex gap-2 items-center">
                    <Input
                        value={h.key}
                        onChange={(e) => updateRow(i, "key", e.target.value)}
                        placeholder="Header name"
                        className="flex-1"
                    />
                    <Input
                        value={h.value}
                        onChange={(e) => updateRow(i, "value", e.target.value)}
                        placeholder="Value"
                        className="flex-1"
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRow(i)}
                        className="shrink-0 h-9 w-9"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            ))}
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addRow}
                className="gap-1.5"
            >
                <Plus className="h-3.5 w-3.5" />
                Add Header
            </Button>
        </div>
    );
}

// ── Destination card ───────────────────────────────────────────────────────────

interface DestinationCardProps {
    destination: Destination;
    onToggle: (id: number, enabled: boolean) => void;
    onEdit: (destination: Destination) => void;
    isToggling: boolean;
    disabled?: boolean;
}

function DestinationCard({
    destination,
    onToggle,
    onEdit,
    isToggling,
    disabled = false
}: DestinationCardProps) {
    const cfg = parseConfig(destination.config);

    return (
        <div className="relative flex flex-col rounded-lg border bg-card text-card-foreground p-5 gap-3">
            {/* Top row: icon + name/type + toggle */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0 flex items-center justify-center w-9 h-9 rounded-md bg-muted">
                        <Globe className="h-5 w-5 text-muted-foreground" />
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

            {/* Footer: edit button */}
            <div className="mt-auto pt-3">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(destination)}
                    disabled={disabled}
                    className="w-full"
                >
                    Edit
                </Button>
            </div>
        </div>
    );
}

// ── Add destination card ───────────────────────────────────────────────────────

function AddDestinationCard({
    onClick,
    disabled = false
}: {
    onClick: () => void;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={disabled ? undefined : onClick}
            disabled={disabled}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-transparent transition-colors p-5 min-h-35 w-full ${
                disabled
                    ? "opacity-50 cursor-not-allowed text-muted-foreground"
                    : "text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 cursor-pointer"
            }`}
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
        description: "Stream events to an S3-compatible object storage bucket. Coming soon.",
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
        description: "Forward events directly to your Datadog account. Coming soon.",
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
}

function DestinationTypePicker({
    open,
    onOpenChange,
    onSelect
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
                    <StrategySelect
                        options={destinationTypeOptions}
                        value={selected}
                        onChange={setSelected}
                        cols={1}
                    />
                </CredenzaBody>
                <CredenzaFooter>
                    <CredenzaClose asChild>
                        <Button variant="outline">Cancel</Button>
                    </CredenzaClose>
                    <Button onClick={() => onSelect(selected)}>
                        Continue
                    </Button>
                </CredenzaFooter>
            </CredenzaContent>
        </Credenza>
    );
}

// ── Destination modal ──────────────────────────────────────────────────────────

interface DestinationModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editing: Destination | null;
    orgId: string;
    onSaved: () => void;
    onDeleted: () => void;
}

function DestinationModal({
    open,
    onOpenChange,
    editing,
    orgId,
    onSaved,
    onDeleted
}: DestinationModalProps) {
    const api = createApiClient(useEnvContext());

    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [cfg, setCfg] = useState<HttpConfig>(defaultConfig());
    const [sendAccessLogs, setSendAccessLogs] = useState(false);
    const [sendActionLogs, setSendActionLogs] = useState(false);
    const [sendConnectionLogs, setSendConnectionLogs] = useState(false);
    const [sendRequestLogs, setSendRequestLogs] = useState(false);

    useEffect(() => {
        if (open) {
            setCfg(editing ? parseConfig(editing.config) : defaultConfig());
            setSendAccessLogs(editing?.sendAccessLogs ?? false);
            setSendActionLogs(editing?.sendActionLogs ?? false);
            setSendConnectionLogs(editing?.sendConnectionLogs ?? false);
            setSendRequestLogs(editing?.sendRequestLogs ?? false);
        }
        if (!open) {
            setDeleteDialogOpen(false);
        }
    }, [open, editing]);

    const update = (patch: Partial<HttpConfig>) =>
        setCfg((prev) => ({ ...prev, ...patch }));

    const urlError: string | null = (() => {
        const raw = cfg.url.trim();
        if (!raw) return null;
        try {
            const parsed = new URL(raw);
            if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
                return "URL must use http or https";
            }
            if (build === "saas" && parsed.protocol !== "https:") {
                return "HTTPS is required on cloud deployments";
            }
            return null;
        } catch {
            return "Enter a valid URL (e.g. https://example.com/webhook)";
        }
    })();

    const isValid =
        cfg.name.trim() !== "" &&
        cfg.url.trim() !== "" &&
        urlError === null;

    async function handleSave() {
        if (!isValid) return;
        setSaving(true);
        try {
            const payload = {
                type: "http",
                config: JSON.stringify(cfg),
                sendAccessLogs,
                sendActionLogs,
                sendConnectionLogs,
                sendRequestLogs
            };
            if (editing) {
                await api.post(
                    `/org/${orgId}/event-streaming-destination/${editing.destinationId}`,
                    payload
                );
                toast({ title: "Destination updated successfully" });
            } else {
                await api.put(
                    `/org/${orgId}/event-streaming-destination`,
                    payload
                );
                toast({ title: "Destination created successfully" });
            }
            onSaved();
            onOpenChange(false);
        } catch (e) {
            toast({
                variant: "destructive",
                title: editing
                    ? "Failed to update destination"
                    : "Failed to create destination",
                description: formatAxiosError(
                    e,
                    "An unexpected error occurred."
                )
            });
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        if (!editing) return;
        setDeleting(true);
        try {
            await api.delete(
                `/org/${orgId}/event-streaming-destination/${editing.destinationId}`
            );
            toast({ title: "Destination deleted successfully" });
            onDeleted();
            onOpenChange(false);
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
    }

    return (
        <>
        <Credenza open={open} onOpenChange={onOpenChange}>
            <CredenzaContent className="sm:max-w-2xl">
                <CredenzaHeader>
                    <CredenzaTitle>
                        {editing ? "Edit Destination" : "Add Destination"}
                    </CredenzaTitle>
                    <CredenzaDescription>
                        {editing
                            ? "Update the configuration for this HTTP event streaming destination."
                            : "Configure a new HTTP endpoint to receive your organization's events."}
                    </CredenzaDescription>
                </CredenzaHeader>

                <CredenzaBody>
                    <HorizontalTabs
                        clientSide
                        items={[
                            { title: "Settings", href: "" },
                            { title: "Headers", href: "" },
                            { title: "Body Template", href: "" },
                            { title: "Logs", href: "" }
                        ]}
                    >
                        {/* ── Settings ─────────────────────────────────── */}
                        <div className="space-y-4 mt-4 p-1">
                            <div className="space-y-1.5">
                                <Label htmlFor="dest-name">Name</Label>
                                <Input
                                    id="dest-name"
                                    placeholder="My HTTP destination"
                                    value={cfg.name}
                                    onChange={(e) =>
                                        update({ name: e.target.value })
                                    }
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="dest-url">Destination URL</Label>
                                <Input
                                    id="dest-url"
                                    placeholder="https://example.com/webhook"
                                    value={cfg.url}
                                    onChange={(e) =>
                                        update({ url: e.target.value })
                                    }
                                />
                                {urlError && (
                                    <p className="text-xs text-destructive mt-1">
                                        {urlError}
                                    </p>
                                )}
                            </div>

                            <div>
                                <div className="mb-4">
                                    <label className="font-medium block">
                                        Authentication
                                    </label>
                                    <div className="text-sm text-muted-foreground">
                                        Choose how requests to your endpoint are authenticated.
                                    </div>
                                </div>
                                <RadioGroup
                                    value={cfg.authType}
                                    onValueChange={(v) =>
                                        update({ authType: v as AuthType })
                                    }
                                    className="gap-2"
                                >
                                    {/* None */}
                                    <div className="flex items-start gap-3 rounded-md border p-3 transition-colors data-[state=checked]:border-primary">
                                        <RadioGroupItem
                                            value="none"
                                            id="auth-none"
                                            className="mt-0.5"
                                        />
                                        <div>
                                            <Label
                                                htmlFor="auth-none"
                                                className="cursor-pointer font-medium"
                                            >
                                                No Authentication
                                            </Label>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                Sends requests without an{" "}
                                                <code className="bg-muted px-1 py-0.5 rounded text-xs">
                                                    Authorization
                                                </code>{" "}
                                                header.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Bearer */}
                                    <div className="flex items-start gap-3 rounded-md border p-3">
                                        <RadioGroupItem
                                            value="bearer"
                                            id="auth-bearer"
                                            className="mt-0.5"
                                        />
                                        <div className="flex-1 space-y-3">
                                            <div>
                                                <Label
                                                    htmlFor="auth-bearer"
                                                    className="cursor-pointer font-medium"
                                                >
                                                    Bearer Token
                                                </Label>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    Adds an{" "}
                                                    <code className="bg-muted px-1 py-0.5 rounded text-xs">
                                                        Authorization: Bearer &lt;token&gt;
                                                    </code>{" "}
                                                    header to each request.
                                                </p>
                                            </div>
                                            {cfg.authType === "bearer" && (
                                                <Input
                                                    placeholder="Your API key or token"
                                                    value={cfg.bearerToken ?? ""}
                                                    onChange={(e) =>
                                                        update({
                                                            bearerToken:
                                                                e.target.value
                                                        })
                                                    }
                                                />
                                            )}
                                        </div>
                                    </div>

                                    {/* Basic */}
                                    <div className="flex items-start gap-3 rounded-md border p-3">
                                        <RadioGroupItem
                                            value="basic"
                                            id="auth-basic"
                                            className="mt-0.5"
                                        />
                                        <div className="flex-1 space-y-3">
                                            <div>
                                                <Label
                                                    htmlFor="auth-basic"
                                                    className="cursor-pointer font-medium"
                                                >
                                                    Basic Auth
                                                </Label>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    Adds an{" "}
                                                    <code className="bg-muted px-1 py-0.5 rounded text-xs">
                                                        Authorization: Basic &lt;credentials&gt;
                                                    </code>{" "}
                                                    header. Provide credentials as{" "}
                                                    <code className="bg-muted px-1 py-0.5 rounded text-xs">
                                                        username:password
                                                    </code>
                                                    .
                                                </p>
                                            </div>
                                            {cfg.authType === "basic" && (
                                                <Input
                                                    placeholder="username:password"
                                                    value={
                                                        cfg.basicCredentials ?? ""
                                                    }
                                                    onChange={(e) =>
                                                        update({
                                                            basicCredentials:
                                                                e.target.value
                                                        })
                                                    }
                                                />
                                            )}
                                        </div>
                                    </div>

                                    {/* Custom */}
                                    <div className="flex items-start gap-3 rounded-md border p-3">
                                        <RadioGroupItem
                                            value="custom"
                                            id="auth-custom"
                                            className="mt-0.5"
                                        />
                                        <div className="flex-1 space-y-3">
                                            <div>
                                                <Label
                                                    htmlFor="auth-custom"
                                                    className="cursor-pointer font-medium"
                                                >
                                                    Custom Header
                                                </Label>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    Specify a custom HTTP header name and value for
                                                    authentication (e.g.{" "}
                                                    <code className="bg-muted px-1 py-0.5 rounded text-xs">
                                                        X-API-Key
                                                    </code>
                                                    ).
                                                </p>
                                            </div>
                                            {cfg.authType === "custom" && (
                                                <div className="flex gap-2">
                                                    <Input
                                                        placeholder="Header name (e.g. X-API-Key)"
                                                        value={
                                                            cfg.customHeaderName ??
                                                            ""
                                                        }
                                                        onChange={(e) =>
                                                            update({
                                                                customHeaderName:
                                                                    e.target.value
                                                            })
                                                        }
                                                        className="flex-1"
                                                    />
                                                    <Input
                                                        placeholder="Header value"
                                                        value={
                                                            cfg.customHeaderValue ??
                                                            ""
                                                        }
                                                        onChange={(e) =>
                                                            update({
                                                                customHeaderValue:
                                                                    e.target.value
                                                            })
                                                        }
                                                        className="flex-1"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </RadioGroup>
                            </div>
                        </div>

                        {/* ── Headers ───────────────────────────────────── */}
                        <div className="space-y-4 mt-4 p-1">
                            <div>
                                <div className="mb-4">
                                    <label className="font-medium block">
                                        Custom HTTP Headers
                                    </label>
                                    <div className="text-sm text-muted-foreground">
                                        Add custom headers to every outgoing request.
                                        Useful for static tokens or custom{" "}
                                        <code className="bg-muted px-1 py-0.5 rounded text-xs">
                                            Content-Type
                                        </code>
                                        . By default,{" "}
                                        <code className="bg-muted px-1 py-0.5 rounded text-xs">
                                            Content-Type: application/json
                                        </code>{" "}
                                        is sent.
                                    </div>
                                </div>
                                <HeadersEditor
                                    headers={cfg.headers}
                                    onChange={(headers) => update({ headers })}
                                />
                            </div>
                        </div>

                        {/* ── Body Template ─────────────────────────────── */}
                        <div className="space-y-4 mt-4 p-1">
                            <div className="mb-4">
                                <label className="font-medium block">
                                    Custom Body Template
                                </label>
                                <div className="text-sm text-muted-foreground">
                                    Control the JSON payload structure sent to your
                                    endpoint. If disabled, a default JSON object is sent
                                    for each event.
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <Switch
                                    id="use-body-template"
                                    checked={cfg.useBodyTemplate}
                                    onCheckedChange={(v) =>
                                        update({ useBodyTemplate: v })
                                    }
                                />
                                <Label
                                    htmlFor="use-body-template"
                                    className="cursor-pointer"
                                >
                                    Enable custom body template
                                </Label>
                            </div>

                            {cfg.useBodyTemplate && (
                                <div className="space-y-1.5">
                                    <Label htmlFor="body-template">
                                        Body Template (JSON)
                                    </Label>
                                    <Textarea
                                        id="body-template"
                                        placeholder={
                                            '{\n  "event": "{{event}}",\n  "timestamp": "{{timestamp}}",\n  "data": {{data}}\n}'
                                        }
                                        value={cfg.bodyTemplate ?? ""}
                                        onChange={(e) =>
                                            update({
                                                bodyTemplate: e.target.value
                                            })
                                        }
                                        className="font-mono text-xs min-h-45 resize-y"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Use template variables to reference event fields in
                                        your payload.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* ── Logs ──────────────────────────────────────── */}
                        <div className="space-y-4 mt-4 p-1">
                            <div className="mb-4">
                                <label className="font-medium block">
                                    Log Types
                                </label>
                                <div className="text-sm text-muted-foreground">
                                    Choose which log types are forwarded to this
                                    destination. Only enabled log types will be
                                    streamed.
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-start gap-3 rounded-md border p-3">
                                    <Checkbox
                                        id="log-access"
                                        checked={sendAccessLogs}
                                        onCheckedChange={(v) =>
                                            setSendAccessLogs(v === true)
                                        }
                                        className="mt-0.5"
                                    />
                                    <div>
                                        <label
                                            htmlFor="log-access"
                                            className="text-sm font-medium cursor-pointer"
                                        >
                                            Access Logs
                                        </label>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Resource access attempts, including
                                            authenticated and denied requests.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3 rounded-md border p-3">
                                    <Checkbox
                                        id="log-action"
                                        checked={sendActionLogs}
                                        onCheckedChange={(v) =>
                                            setSendActionLogs(v === true)
                                        }
                                        className="mt-0.5"
                                    />
                                    <div>
                                        <label
                                            htmlFor="log-action"
                                            className="text-sm font-medium cursor-pointer"
                                        >
                                            Action Logs
                                        </label>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Administrative actions performed by
                                            users within the organization.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3 rounded-md border p-3">
                                    <Checkbox
                                        id="log-connection"
                                        checked={sendConnectionLogs}
                                        onCheckedChange={(v) =>
                                            setSendConnectionLogs(v === true)
                                        }
                                        className="mt-0.5"
                                    />
                                    <div>
                                        <label
                                            htmlFor="log-connection"
                                            className="text-sm font-medium cursor-pointer"
                                        >
                                            Connection Logs
                                        </label>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Site and tunnel connection events,
                                            including connects and disconnects.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3 rounded-md border p-3">
                                    <Checkbox
                                        id="log-request"
                                        checked={sendRequestLogs}
                                        onCheckedChange={(v) =>
                                            setSendRequestLogs(v === true)
                                        }
                                        className="mt-0.5"
                                    />
                                    <div>
                                        <label
                                            htmlFor="log-request"
                                            className="text-sm font-medium cursor-pointer"
                                        >
                                            Request Logs
                                        </label>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            HTTP request logs for proxied
                                            resources, including method, path,
                                            and response code.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </HorizontalTabs>
                </CredenzaBody>

                <CredenzaFooter>
                    {editing && (
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={() => setDeleteDialogOpen(true)}
                            disabled={saving || deleting}
                            className="mr-auto"
                        >
                            Delete
                        </Button>
                    )}
                    <CredenzaClose asChild>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={saving || deleting}
                        >
                            Cancel
                        </Button>
                    </CredenzaClose>
                    <Button
                        type="button"
                        onClick={handleSave}
                        loading={saving}
                        disabled={!isValid || deleting}
                    >
                        {editing ? "Save Changes" : "Create Destination"}
                    </Button>
                </CredenzaFooter>
            </CredenzaContent>
        </Credenza>

        {editing && (
            <ConfirmDeleteDialog
                open={deleteDialogOpen}
                setOpen={setDeleteDialogOpen}
                string={parseConfig(editing.config).name || "delete"}
                title="Delete Destination"
                dialog={
                    <p className="text-sm text-muted-foreground">
                        Are you sure you want to delete the destination{" "}
                        <span className="font-semibold text-foreground">
                            {parseConfig(editing.config).name || "this destination"}
                        </span>
                        ? All configuration will be permanently removed.
                    </p>
                }
                buttonText="Delete Destination"
                onConfirm={handleDelete}
            />
        )}
        </>
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div
                            key={i}
                            className="rounded-lg border bg-card p-5 min-h-36 animate-pulse"
                        />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {destinations.map((dest) => (
                        <DestinationCard
                            key={dest.destinationId}
                            destination={dest}
                            onToggle={handleToggle}
                            onEdit={openEdit}
                            isToggling={togglingIds.has(dest.destinationId)}
                            disabled={!isEnterprise}
                        />
                    ))}
                    <AddDestinationCard
                        onClick={openCreate}
                        disabled={!isEnterprise}
                    />
                </div>
            )}

            <DestinationTypePicker
                open={typePickerOpen}
                onOpenChange={setTypePickerOpen}
                onSelect={handleTypePicked}
            />

            <DestinationModal
                open={modalOpen}
                onOpenChange={setModalOpen}
                editing={editingDestination}
                orgId={orgId}
                onSaved={loadDestinations}
                onDeleted={loadDestinations}
            />
        </>
    );
}
