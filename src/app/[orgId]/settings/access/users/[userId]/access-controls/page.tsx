"use client";

import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@app/components/ui/select";
import { Checkbox } from "@app/components/ui/checkbox";
import { toast } from "@app/hooks/useToast";
import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosResponse } from "axios";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ListRolesResponse } from "@server/routers/role";
import { userOrgUserContext } from "@app/hooks/useOrgUserContext";
import { useParams } from "next/navigation";
import { Button } from "@app/components/ui/button";
import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionHeader,
    SettingsSectionTitle,
    SettingsSectionDescription,
    SettingsSectionBody,
    SettingsSectionForm,
    SettingsSectionFooter
} from "@app/components/Settings";
import { formatAxiosError } from "@app/lib/api";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useTranslations } from "next-intl";
import IdpTypeBadge from "@app/components/IdpTypeBadge";
import { UserType } from "@server/types/UserTypes";
import { Badge } from "@app/components/ui/badge";

type UserRole = { roleId: number; name: string };

export default function AccessControlsPage() {
    const { orgUser: user } = userOrgUserContext();

    const api = createApiClient(useEnvContext());

    const { orgId } = useParams();

    const [loading, setLoading] = useState(false);
    const [roles, setRoles] = useState<{ roleId: number; name: string }[]>([]);
    const [userRoles, setUserRoles] = useState<UserRole[]>([]);

    const t = useTranslations();

    const formSchema = z.object({
        username: z.string(),
        autoProvisioned: z.boolean()
    });

    const form = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            username: user.username!,
            autoProvisioned: user.autoProvisioned || false
        }
    });

    const currentRoleIds = user.roleIds ?? [];
    const currentRoles: UserRole[] = user.roles ?? [];

    useEffect(() => {
        setUserRoles(currentRoles);
    }, [user.userId, currentRoleIds.join(",")]);

    useEffect(() => {
        async function fetchRoles() {
            const res = await api
                .get<AxiosResponse<ListRolesResponse>>(`/org/${orgId}/roles`)
                .catch((e) => {
                    console.error(e);
                    toast({
                        variant: "destructive",
                        title: t("accessRoleErrorFetch"),
                        description: formatAxiosError(
                            e,
                            t("accessRoleErrorFetchDescription")
                        )
                    });
                });

            if (res?.status === 200) {
                setRoles(res.data.data.roles);
            }
        }

        fetchRoles();
        form.setValue("autoProvisioned", user.autoProvisioned || false);
    }, []);

    async function handleAddRole(roleId: number) {
        setLoading(true);
        try {
            await api.post(`/role/${roleId}/add/${user.userId}`);
            toast({
                variant: "default",
                title: t("userSaved"),
                description: t("userSavedDescription")
            });
            const role = roles.find((r) => r.roleId === roleId);
            if (role) setUserRoles((prev) => [...prev, role]);
        } catch (e) {
            toast({
                variant: "destructive",
                title: t("accessRoleErrorAdd"),
                description: formatAxiosError(
                    e,
                    t("accessRoleErrorAddDescription")
                )
            });
        }
        setLoading(false);
    }

    async function handleRemoveRole(roleId: number) {
        setLoading(true);
        try {
            await api.delete(`/role/${roleId}/remove/${user.userId}`);
            toast({
                variant: "default",
                title: t("userSaved"),
                description: t("userSavedDescription")
            });
            setUserRoles((prev) => prev.filter((r) => r.roleId !== roleId));
        } catch (e) {
            toast({
                variant: "destructive",
                title: t("accessRoleErrorAdd"),
                description: formatAxiosError(
                    e,
                    t("accessRoleErrorAddDescription")
                )
            });
        }
        setLoading(false);
    }

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setLoading(true);
        try {
            await api.post(`/org/${orgId}/user/${user.userId}`, {
                autoProvisioned: values.autoProvisioned
            });
            toast({
                variant: "default",
                title: t("userSaved"),
                description: t("userSavedDescription")
            });
        } catch (e) {
            toast({
                variant: "destructive",
                title: t("accessRoleErrorAdd"),
                description: formatAxiosError(
                    e,
                    t("accessRoleErrorAddDescription")
                )
            });
        }
        setLoading(false);
    }

    const availableRolesToAdd = roles.filter(
        (r) => !userRoles.some((ur) => ur.roleId === r.roleId)
    );
    const canRemoveRole = userRoles.length > 1;

    return (
        <SettingsContainer>
            <SettingsSection>
                <SettingsSectionHeader>
                    <SettingsSectionTitle>
                        {t("accessControls")}
                    </SettingsSectionTitle>
                    <SettingsSectionDescription>
                        {t("accessControlsDescription")}
                    </SettingsSectionDescription>
                </SettingsSectionHeader>

                <SettingsSectionBody>
                    <SettingsSectionForm>
                        <Form {...form}>
                            <form
                                onSubmit={form.handleSubmit(onSubmit)}
                                className="space-y-4"
                                id="access-controls-form"
                            >
                                {user.type !== UserType.Internal &&
                                    user.idpType && (
                                        <div className="flex items-center space-x-2 mb-4">
                                            <span className="text-sm font-medium text-muted-foreground">
                                                {t("idp")}:
                                            </span>
                                            <IdpTypeBadge
                                                type={user.idpType}
                                                variant={
                                                    user.idpVariant || undefined
                                                }
                                                name={user.idpName || undefined}
                                            />
                                        </div>
                                    )}

                                <FormItem>
                                    <FormLabel>{t("role")}</FormLabel>
                                    <div className="flex flex-wrap gap-2 items-center">
                                        {userRoles.map((r) => (
                                            <Badge
                                                key={r.roleId}
                                                variant="secondary"
                                                className="flex items-center gap-1"
                                            >
                                                {r.name}
                                                {canRemoveRole && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            handleRemoveRole(
                                                                r.roleId
                                                            )
                                                        }
                                                        disabled={loading}
                                                        className="ml-1 rounded hover:bg-muted"
                                                        aria-label={`Remove ${r.name}`}
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                            </Badge>
                                        ))}
                                        {availableRolesToAdd.length > 0 && (
                                            <Select
                                                onValueChange={(value) => {
                                                    handleAddRole(
                                                        parseInt(value, 10)
                                                    );
                                                }}
                                                disabled={loading}
                                            >
                                                <SelectTrigger className="w-[180px]">
                                                    <SelectValue
                                                        placeholder={t(
                                                            "accessRoleSelect"
                                                        )}
                                                    />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availableRolesToAdd.map(
                                                        (role) => (
                                                            <SelectItem
                                                                key={
                                                                    role.roleId
                                                                }
                                                                value={role.roleId.toString()}
                                                            >
                                                                {role.name}
                                                            </SelectItem>
                                                        )
                                                    )}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    </div>
                                    {userRoles.length === 0 && (
                                        <p className="text-sm text-muted-foreground">
                                            {t("accessRoleSelectPlease")}
                                        </p>
                                    )}
                                </FormItem>

                                {user.idpAutoProvision && (
                                    <FormField
                                        control={form.control}
                                        name="autoProvisioned"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-start space-x-2 space-y-0">
                                                <FormControl>
                                                    <Checkbox
                                                        checked={field.value}
                                                        onCheckedChange={
                                                            field.onChange
                                                        }
                                                    />
                                                </FormControl>
                                                <div className="space-y-1 leading-none">
                                                    <FormLabel>
                                                        {t(
                                                            "autoProvisioned"
                                                        )}
                                                    </FormLabel>
                                                    <p className="text-sm text-muted-foreground">
                                                        {t(
                                                            "autoProvisionedDescription"
                                                        )}
                                                    </p>
                                                </div>
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </form>
                        </Form>
                    </SettingsSectionForm>
                </SettingsSectionBody>

                <SettingsSectionFooter>
                    <Button
                        type="submit"
                        loading={loading}
                        disabled={loading}
                        form="access-controls-form"
                    >
                        {t("accessControlsSubmit")}
                    </Button>
                </SettingsSectionFooter>
            </SettingsSection>
        </SettingsContainer>
    );
}
