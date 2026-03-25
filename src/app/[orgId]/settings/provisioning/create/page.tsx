import { redirect } from "next/navigation";

type PageProps = {
    params: Promise<{ orgId: string }>;
};

export default async function ProvisioningCreateRedirect(props: PageProps) {
    const params = await props.params;
    redirect(`/${params.orgId}/settings/provisioning`);
}
