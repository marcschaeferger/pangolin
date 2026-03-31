"use client";

import { useState, useEffect } from "react";
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
import { Plus, X } from "lucide-react";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { build } from "@server/build";

// ── Types ──────────────────────────────────────────────────────────────────────

export type AuthType = "none" | "bearer" | "basic" | "custom";

export type PayloadFormat = "json_array" | "ndjson" | "json_single";

export interface HttpConfig {
    name: string;
    url: string;
    authType: AuthType;
    bearerToken?: string;
    basicCredentials?: string;
    customHeaderName?: string;
    customHeaderValue?: string;
    headers: Array<{ key: string; value: string }>;
    format: PayloadFormat;
    useBodyTemplate: boolean;
    bodyTemplate?: string;
}

export interface Destination {
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

// ── Helpers ────────────────────────────────────────────────────────────────────

export const defaultHttpConfig = (): HttpConfig => ({
    name: "",
    url: "",
    authType: "none",
    bearerToken: "",
    basicCredentials: "",
    customHeaderName: "",
    customHeaderValue: "",
    headers: [],
    format: "json_array",
    useBodyTemplate: false,
    bodyTemplate: ""
});

export function parseHttpConfig(raw: string): HttpConfig {
    try {
        return { ...defaultHttpConfig(), ...JSON.parse(raw) };
    } catch {
        return defaultHttpConfig();
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

    const updateRow = (i: number, field: "key" | "value", val: string) => {
        const next = [...headers];
        next[i] = { ...next[i], [field]: val };
        onChange(next);
    };

    return (
        <div className="space-y-3">
            {headers.length === 0 && (
                <p className="text-xs text-muted-foreground">
                    No custom headers configured. Click "Add Header" to add
                    one.
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
                        onChange={(e) =>
                            updateRow(i, "value", e.target.value)
                        }
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

// ── Component ──────────────────────────────────────────────────────────────────

export interface HttpDestinationCredenzaProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editing: Destination | null;
    orgId: string;
    onSaved: () => void;
}

export function HttpDestinationCredenza({
    open,
    onOpenChange,
    editing,
    orgId,
    onSaved
}: HttpDestinationCredenzaProps) {
    const api = createApiClient(useEnvContext());

    const [saving, setSaving] = useState(false);
    const [cfg, setCfg] = useState<HttpConfig>(defaultHttpConfig());
    const [sendAccessLogs, setSendAccessLogs] = useState(false);
    const [sendActionLogs, setSendActionLogs] = useState(false);
    const [sendConnectionLogs, setSendConnectionLogs] = useState(false);
    const [sendRequestLogs, setSendRequestLogs] = useState(false);

    useEffect(() => {
        if (open) {
            setCfg(
                editing ? parseHttpConfig(editing.config) : defaultHttpConfig()
            );
            setSendAccessLogs(editing?.sendAccessLogs ?? false);
            setSendActionLogs(editing?.sendActionLogs ?? false);
            setSendConnectionLogs(editing?.sendConnectionLogs ?? false);
            setSendRequestLogs(editing?.sendRequestLogs ?? false);
        }
    }, [open, editing]);

    const update = (patch: Partial<HttpConfig>) =>
        setCfg((prev) => ({ ...prev, ...patch }));

    const urlError: string | null = (() => {
        const raw = cfg.url.trim();
        if (!raw) return null;
        try {
            const parsed = new URL(raw);
            if (
                parsed.protocol !== "http:" &&
                parsed.protocol !== "https:"
            ) {
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

    return (
        <Credenza open={open} onOpenChange={onOpenChange}>
            <CredenzaContent className="sm:max-w-2xl">
                <CredenzaHeader>
                    <CredenzaTitle>
                        {editing
                            ? "Edit Destination"
                            : "Add HTTP Destination"}
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
                            { title: "Body", href: "" },
                            { title: "Logs", href: "" }
                        ]}
                    >
                        {/* ── Settings tab ────────────────────────────── */}
                        <div className="space-y-6 mt-4 p-1">
                            {/* Name */}
                            <div className="space-y-2">
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

                            {/* URL */}
                            <div className="space-y-2">
                                <Label htmlFor="dest-url">
                                    Destination URL
                                </Label>
                                <Input
                                    id="dest-url"
                                    placeholder="https://example.com/webhook"
                                    value={cfg.url}
                                    onChange={(e) =>
                                        update({ url: e.target.value })
                                    }
                                />
                                {urlError && (
                                    <p className="text-xs text-destructive">
                                        {urlError}
                                    </p>
                                )}
                            </div>

                            {/* Authentication */}
                            <div className="space-y-3">
                                <div>
                                    <label className="font-medium block">
                                        Authentication
                                    </label>
                                    <p className="text-sm text-muted-foreground mt-0.5">
                                        Choose how requests to your endpoint
                                        are authenticated.
                                    </p>
                                </div>

                                <RadioGroup
                                    value={cfg.authType}
                                    onValueChange={(v) =>
                                        update({ authType: v as AuthType })
                                    }
                                    className="gap-2"
                                >
                                    {/* None */}
                                    <div className="flex items-start gap-3 rounded-md border p-3 transition-colors">
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
                                                        Authorization: Bearer
                                                        &lt;token&gt;
                                                    </code>{" "}
                                                    header to each request.
                                                </p>
                                            </div>
                                            {cfg.authType === "bearer" && (
                                                <Input
                                                    placeholder="Your API key or token"
                                                    value={
                                                        cfg.bearerToken ?? ""
                                                    }
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
                                                        Authorization: Basic
                                                        &lt;credentials&gt;
                                                    </code>{" "}
                                                    header. Provide credentials
                                                    as{" "}
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
                                                        cfg.basicCredentials ??
                                                        ""
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
                                                    Specify a custom HTTP
                                                    header name and value for
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
                                                                    e.target
                                                                        .value
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
                                                                    e.target
                                                                        .value
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

                        {/* ── Headers tab ──────────────────────────────── */}
                        <div className="space-y-6 mt-4 p-1">
                            <div>
                                <label className="font-medium block">
                                    Custom HTTP Headers
                                </label>
                                <p className="text-sm text-muted-foreground mt-0.5">
                                    Add custom headers to every outgoing
                                    request. Useful for static tokens or
                                    custom{" "}
                                    <code className="bg-muted px-1 py-0.5 rounded text-xs">
                                        Content-Type
                                    </code>
                                    . By default,{" "}
                                    <code className="bg-muted px-1 py-0.5 rounded text-xs">
                                        Content-Type: application/json
                                    </code>{" "}
                                    is sent.
                                </p>
                            </div>
                            <HeadersEditor
                                headers={cfg.headers}
                                onChange={(headers) => update({ headers })}
                            />
                        </div>

                        {/* ── Body tab ─────────────────────────── */}
                        <div className="space-y-6 mt-4 p-1">
                            <div>
                                <label className="font-medium block">
                                    Custom Body Template
                                </label>
                                <p className="text-sm text-muted-foreground mt-0.5">
                                    Control the JSON payload structure sent to
                                    your endpoint. If disabled, a default JSON
                                    object is sent for each event.
                                </p>
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
                                <div className="space-y-2">
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
                                        Use template variables to reference
                                        event fields in your payload.
                                    </p>
                                </div>
                            )}

                            {/* Payload Format */}
                            <div className="space-y-3">
                                <div>
                                    <label className="font-medium block">
                                        Payload Format
                                    </label>
                                    <p className="text-sm text-muted-foreground mt-0.5">
                                        How events are serialised into each
                                        request body.
                                    </p>
                                </div>

                                <RadioGroup
                                    value={cfg.format ?? "json_array"}
                                    onValueChange={(v) =>
                                        update({
                                            format: v as PayloadFormat
                                        })
                                    }
                                    className="gap-2"
                                >
                                    {/* JSON Array */}
                                    <div className="flex items-start gap-3 rounded-md border p-3 transition-colors">
                                        <RadioGroupItem
                                            value="json_array"
                                            id="fmt-json-array"
                                            className="mt-0.5"
                                        />
                                        <div>
                                            <Label
                                                htmlFor="fmt-json-array"
                                                className="cursor-pointer font-medium"
                                            >
                                                JSON Array
                                            </Label>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                One request per batch, body is
                                                a JSON array{" "}
                                                <code className="bg-muted px-1 py-0.5 rounded text-xs">
                                                    [{"{...}"}, {"{...}"}]
                                                </code>
                                                . Compatible with most generic
                                                webhooks and Datadog.
                                            </p>
                                        </div>
                                    </div>

                                    {/* NDJSON */}
                                    <div className="flex items-start gap-3 rounded-md border p-3 transition-colors">
                                        <RadioGroupItem
                                            value="ndjson"
                                            id="fmt-ndjson"
                                            className="mt-0.5"
                                        />
                                        <div>
                                            <Label
                                                htmlFor="fmt-ndjson"
                                                className="cursor-pointer font-medium"
                                            >
                                                NDJSON
                                            </Label>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                One request per batch, body is
                                                newline-delimited JSON — one
                                                object per line, no outer
                                                array. Required by{" "}
                                                <strong>Splunk HEC</strong>,{" "}
                                                <strong>
                                                    Elastic / OpenSearch
                                                </strong>
                                                , and{" "}
                                                <strong>Grafana Loki</strong>.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Single event per request */}
                                    <div className="flex items-start gap-3 rounded-md border p-3 transition-colors">
                                        <RadioGroupItem
                                            value="json_single"
                                            id="fmt-json-single"
                                            className="mt-0.5"
                                        />
                                        <div>
                                            <Label
                                                htmlFor="fmt-json-single"
                                                className="cursor-pointer font-medium"
                                            >
                                                One Event Per Request
                                            </Label>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                Sends a separate HTTP POST for
                                                each individual event. Use only
                                                for endpoints that cannot
                                                handle batches.
                                            </p>
                                        </div>
                                    </div>
                                </RadioGroup>
                            </div>
                        </div>

                        {/* ── Logs tab ──────────────────────────────────── */}
                        <div className="space-y-6 mt-4 p-1">
                            <div>
                                <label className="font-medium block">
                                    Log Types
                                </label>
                                <p className="text-sm text-muted-foreground mt-0.5">
                                    Choose which log types are forwarded to
                                    this destination. Only enabled log types
                                    will be streamed.
                                </p>
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
                                            including connects and
                                            disconnects.
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
                    <CredenzaClose asChild>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={saving}
                        >
                            Cancel
                        </Button>
                    </CredenzaClose>
                    <Button
                        type="button"
                        onClick={handleSave}
                        loading={saving}
                        disabled={!isValid || saving}
                    >
                        {editing ? "Save Changes" : "Create Destination"}
                    </Button>
                </CredenzaFooter>
            </CredenzaContent>
        </Credenza>
    );
}
