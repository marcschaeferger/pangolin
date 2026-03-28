"use client";

import {
    StrategySelect,
    type StrategyOption
} from "@app/components/StrategySelect";
import type { IdpOidcProviderType } from "@app/lib/idp/oidcIdpProviderDefaults";
import { useTranslations } from "next-intl";
import Image from "next/image";

type Props = {
    value: IdpOidcProviderType;
    onTypeChange: (type: IdpOidcProviderType) => void;
    templatesPaid: boolean;
};

export function OidcIdpProviderTypeSelect({
    value,
    onTypeChange,
    templatesPaid
}: Props) {
    const t = useTranslations();

    const options: ReadonlyArray<StrategyOption<IdpOidcProviderType>> = [
        {
            id: "oidc",
            title: "OAuth2/OIDC",
            description: t("idpOidcDescription")
        },
        {
            id: "google",
            title: t("idpGoogleTitle"),
            description: t("idpGoogleDescription"),
            disabled: !templatesPaid,
            icon: (
                <Image
                    src="/idp/google.png"
                    alt={t("idpGoogleAlt")}
                    width={24}
                    height={24}
                    className="rounded"
                />
            )
        },
        {
            id: "azure",
            title: t("idpAzureTitle"),
            description: t("idpAzureDescription"),
            disabled: !templatesPaid,
            icon: (
                <Image
                    src="/idp/azure.png"
                    alt={t("idpAzureAlt")}
                    width={24}
                    height={24}
                    className="rounded"
                />
            )
        }
    ];

    return (
        <div>
            <div className="mb-2">
                <span className="text-sm font-medium">{t("idpType")}</span>
            </div>
            <StrategySelect
                value={value}
                options={options}
                onChange={onTypeChange}
                cols={3}
            />
        </div>
    );
}
