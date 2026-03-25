"use client";

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
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
import { Button } from "@app/components/ui/button";
import { Input } from "@app/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@app/components/ui/alert";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { CreateSiteProvisioningKeyResponse } from "@server/routers/siteProvisioning/createSiteProvisioningKey";
import { AxiosResponse } from "axios";
import { InfoIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import CopyTextBox from "@app/components/CopyTextBox";

const FORM_ID = "create-site-provisioning-key-form";

type CreateSiteProvisioningKeyCredenzaProps = {
    open: boolean;
    setOpen: (open: boolean) => void;
    orgId: string;
};

export default function CreateSiteProvisioningKeyCredenza({
    open,
    setOpen,
    orgId
}: CreateSiteProvisioningKeyCredenzaProps) {
    const t = useTranslations();
    const router = useRouter();
    const api = createApiClient(useEnvContext());
    const [loading, setLoading] = useState(false);
    const [created, setCreated] =
        useState<CreateSiteProvisioningKeyResponse | null>(null);

    const createFormSchema = z.object({
        name: z
            .string()
            .min(1, {
                message: t("nameMin", { len: 1 })
            })
            .max(255, {
                message: t("nameMax", { len: 255 })
            })
    });

    type CreateFormValues = z.infer<typeof createFormSchema>;

    const form = useForm<CreateFormValues>({
        resolver: zodResolver(createFormSchema),
        defaultValues: {
            name: ""
        }
    });

    useEffect(() => {
        if (!open) {
            setCreated(null);
            form.reset({ name: "" });
        }
    }, [open, form]);

    async function onSubmit(data: CreateFormValues) {
        setLoading(true);
        try {
            const res = await api
                .put<
                    AxiosResponse<CreateSiteProvisioningKeyResponse>
                >(`/org/${orgId}/site-provisioning-key`, { name: data.name })
                .catch((e) => {
                    toast({
                        variant: "destructive",
                        title: t("provisioningKeysErrorCreate"),
                        description: formatAxiosError(e)
                    });
                });

            if (res && res.status === 201) {
                setCreated(res.data.data);
                router.refresh();
            }
        } finally {
            setLoading(false);
        }
    }

    const credential =
        created &&
        `${created.siteProvisioningKeyId}.${created.siteProvisioningKey}`;

    return (
        <Credenza open={open} onOpenChange={setOpen}>
            <CredenzaContent>
                <CredenzaHeader>
                    <CredenzaTitle>
                        {created
                            ? t("provisioningKeysList")
                            : t("provisioningKeysCreate")}
                    </CredenzaTitle>
                    {!created && (
                        <CredenzaDescription>
                            {t("provisioningKeysCreateDescription")}
                        </CredenzaDescription>
                    )}
                </CredenzaHeader>
                <CredenzaBody>
                    {!created && (
                        <Form {...form}>
                            <form
                                id={FORM_ID}
                                onSubmit={form.handleSubmit(onSubmit)}
                                className="space-y-4"
                            >
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t("name")}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    autoComplete="off"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </form>
                        </Form>
                    )}

                    {created && credential && (
                        <div className="space-y-4">
                            <Alert variant="neutral">
                                <InfoIcon className="h-4 w-4" />
                                <AlertTitle className="font-semibold">
                                    {t("provisioningKeysSave")}
                                </AlertTitle>
                                <AlertDescription>
                                    {t("provisioningKeysSaveDescription")}
                                </AlertDescription>
                            </Alert>
                            <CopyTextBox text={credential} />
                        </div>
                    )}
                </CredenzaBody>
                <CredenzaFooter>
                    {!created ? (
                        <>
                            <CredenzaClose asChild>
                                <Button variant="outline">{t("close")}</Button>
                            </CredenzaClose>
                            <Button
                                type="submit"
                                form={FORM_ID}
                                loading={loading}
                                disabled={loading}
                            >
                                {t("generate")}
                            </Button>
                        </>
                    ) : (
                        <CredenzaClose asChild>
                            <Button variant="default">{t("done")}</Button>
                        </CredenzaClose>
                    )}
                </CredenzaFooter>
            </CredenzaContent>
        </Credenza>
    );
}
