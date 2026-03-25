import { internal } from "@app/lib/api";
import { authCookieHeader } from "@app/lib/api/cookies";
import { AxiosResponse } from "axios";
import { PaidFeaturesAlert } from "@app/components/PaidFeaturesAlert";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import SiteProvisioningKeysTable, {
    SiteProvisioningKeyRow
} from "../../../../components/SiteProvisioningKeysTable";
import { ListSiteProvisioningKeysResponse } from "@server/routers/siteProvisioning/types";
import { getTranslations } from "next-intl/server";
import { TierFeature, tierMatrix } from "@server/lib/billing/tierMatrix";

type ProvisioningPageProps = {
    params: Promise<{ orgId: string }>;
};

export const dynamic = "force-dynamic";

export default async function ProvisioningPage(props: ProvisioningPageProps) {
    const params = await props.params;
    const t = await getTranslations();

    let siteProvisioningKeys: ListSiteProvisioningKeysResponse["siteProvisioningKeys"] =
        [];
    try {
        const res = await internal.get<
            AxiosResponse<ListSiteProvisioningKeysResponse>
        >(
            `/org/${params.orgId}/site-provisioning-keys`,
            await authCookieHeader()
        );
        siteProvisioningKeys = res.data.data.siteProvisioningKeys;
    } catch (e) {}

    const rows: SiteProvisioningKeyRow[] = siteProvisioningKeys.map((k) => ({
        name: k.name,
        id: k.siteProvisioningKeyId,
        key: `${k.siteProvisioningKeyId}••••••••••••••••••••${k.lastChars}`,
        createdAt: k.createdAt,
        lastUsed: k.lastUsed,
        maxBatchSize: k.maxBatchSize,
        numUsed: k.numUsed,
        validUntil: k.validUntil
    }));

    return (
        <>
            <SettingsSectionTitle
                title={t("provisioningKeysManage")}
                description={t("provisioningKeysDescription")}
            />

            <PaidFeaturesAlert
                tiers={tierMatrix[TierFeature.SiteProvisioningKeys]}
            />

            <SiteProvisioningKeysTable keys={rows} orgId={params.orgId} />
        </>
    );
}
