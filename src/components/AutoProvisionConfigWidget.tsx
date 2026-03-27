"use client";

import {
    FormLabel,
    FormDescription
} from "@app/components/ui/form";
import { SwitchInput } from "@app/components/SwitchInput";
import { RadioGroup, RadioGroupItem } from "@app/components/ui/radio-group";
import { Button } from "@app/components/ui/button";
import { Input } from "@app/components/ui/input";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import { Tag, TagInput } from "@app/components/tags/tag-input";
import {
    createMappingBuilderRule,
    MappingBuilderRule,
    RoleMappingMode
} from "@app/lib/idpRoleMapping";

type Role = {
    roleId: number;
    name: string;
};

type AutoProvisionConfigWidgetProps = {
    autoProvision: boolean;
    onAutoProvisionChange: (checked: boolean) => void;
    roleMappingMode: RoleMappingMode;
    onRoleMappingModeChange: (mode: RoleMappingMode) => void;
    roles: Role[];
    fixedRoleNames: string[];
    onFixedRoleNamesChange: (roleNames: string[]) => void;
    mappingBuilderClaimPath: string;
    onMappingBuilderClaimPathChange: (claimPath: string) => void;
    mappingBuilderRules: MappingBuilderRule[];
    onMappingBuilderRulesChange: (rules: MappingBuilderRule[]) => void;
    rawExpression: string;
    onRawExpressionChange: (expression: string) => void;
};

export default function AutoProvisionConfigWidget({
    autoProvision,
    onAutoProvisionChange,
    roleMappingMode,
    onRoleMappingModeChange,
    roles,
    fixedRoleNames,
    onFixedRoleNamesChange,
    mappingBuilderClaimPath,
    onMappingBuilderClaimPathChange,
    mappingBuilderRules,
    onMappingBuilderRulesChange,
    rawExpression,
    onRawExpressionChange
}: AutoProvisionConfigWidgetProps) {
    const t = useTranslations();
    const { isPaidUser } = usePaidStatus();
    const [activeFixedRoleTagIndex, setActiveFixedRoleTagIndex] = useState<
        number | null
    >(null);

    const roleOptions = useMemo(
        () =>
            roles.map((role) => ({
                id: role.name,
                text: role.name
            })),
        [roles]
    );

    return (
        <div className="space-y-4">
            <div className="mb-4">
                <SwitchInput
                    id="auto-provision-toggle"
                    label={t("idpAutoProvisionUsers")}
                    defaultChecked={autoProvision}
                    onCheckedChange={onAutoProvisionChange}
                    disabled={!isPaidUser(tierMatrix.autoProvisioning)}
                />
                <span className="text-sm text-muted-foreground">
                    {t("idpAutoProvisionUsersDescription")}
                </span>
            </div>

            {autoProvision && (
                <div className="space-y-4">
                    <div>
                        <FormLabel className="mb-2">
                            {t("roleMapping")}
                        </FormLabel>
                        <FormDescription className="mb-4">
                            {t("roleMappingDescription")}
                        </FormDescription>

                        <RadioGroup
                            value={roleMappingMode}
                            onValueChange={onRoleMappingModeChange}
                            className="flex flex-wrap gap-x-6 gap-y-2"
                        >
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem
                                    value="fixedRoles"
                                    id="fixed-roles-mode"
                                />
                                <label
                                    htmlFor="fixed-roles-mode"
                                    className="text-sm font-medium"
                                >
                                    Fixed roles
                                </label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem
                                    value="mappingBuilder"
                                    id="mapping-builder-mode"
                                />
                                <label
                                    htmlFor="mapping-builder-mode"
                                    className="text-sm font-medium"
                                >
                                    Mapping builder
                                </label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem
                                    value="rawExpression"
                                    id="expression-mode"
                                />
                                <label
                                    htmlFor="expression-mode"
                                    className="text-sm font-medium"
                                >
                                    Raw expression
                                </label>
                            </div>
                        </RadioGroup>
                    </div>

                    {roleMappingMode === "fixedRoles" && (
                        <div className="space-y-2">
                            <TagInput
                                tags={fixedRoleNames.map((name) => ({
                                    id: name,
                                    text: name
                                }))}
                                setTags={(nextTags) => {
                                    const next =
                                        typeof nextTags === "function"
                                            ? nextTags(
                                                  fixedRoleNames.map((name) => ({
                                                      id: name,
                                                      text: name
                                                  }))
                                              )
                                            : nextTags;

                                    onFixedRoleNamesChange(
                                        [...new Set(next.map((tag) => tag.text))]
                                    );
                                }}
                                activeTagIndex={activeFixedRoleTagIndex}
                                setActiveTagIndex={setActiveFixedRoleTagIndex}
                                placeholder="Select one or more roles"
                                enableAutocomplete={true}
                                autocompleteOptions={roleOptions}
                                restrictTagsToAutocompleteOptions={true}
                                allowDuplicates={false}
                                sortTags={true}
                                size="sm"
                            />
                            <FormDescription>
                                Assign the same role set to every auto-provisioned
                                user.
                            </FormDescription>
                        </div>
                    )}

                    {roleMappingMode === "mappingBuilder" && (
                        <div className="space-y-4 rounded-md border p-3">
                            <div className="space-y-2">
                                <FormLabel>Claim path</FormLabel>
                                <Input
                                    value={mappingBuilderClaimPath}
                                    onChange={(e) =>
                                        onMappingBuilderClaimPathChange(
                                            e.target.value
                                        )
                                    }
                                    placeholder="groups"
                                />
                                <FormDescription>
                                    Path in the token payload that contains source
                                    values (for example, groups).
                                </FormDescription>
                            </div>

                            <div className="space-y-3">
                                <div className="hidden md:grid md:grid-cols-[minmax(220px,1fr)_minmax(340px,2fr)_auto] md:gap-3">
                                    <FormLabel>Match value</FormLabel>
                                    <FormLabel>Assign roles</FormLabel>
                                    <span />
                                </div>

                                {mappingBuilderRules.map((rule, index) => (
                                    <BuilderRuleRow
                                        key={rule.id ?? `mapping-rule-${index}`}
                                        roleOptions={roleOptions}
                                        rule={rule}
                                        onChange={(nextRule) => {
                                            const nextRules =
                                                mappingBuilderRules.map(
                                                    (row, i) =>
                                                        i === index
                                                            ? nextRule
                                                            : row
                                                );
                                            onMappingBuilderRulesChange(
                                                nextRules
                                            );
                                        }}
                                        onRemove={() => {
                                            const nextRules =
                                                mappingBuilderRules.filter(
                                                    (_, i) => i !== index
                                                );
                                            onMappingBuilderRulesChange(
                                                nextRules.length
                                                    ? nextRules
                                                    : [createMappingBuilderRule()]
                                            );
                                        }}
                                    />
                                ))}
                            </div>

                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    onMappingBuilderRulesChange([
                                        ...mappingBuilderRules,
                                        createMappingBuilderRule()
                                    ]);
                                }}
                            >
                                Add mapping rule
                            </Button>
                        </div>
                    )}

                    {roleMappingMode === "rawExpression" && (
                        <div className="space-y-2">
                            <Input
                                value={rawExpression}
                                onChange={(e) =>
                                    onRawExpressionChange(e.target.value)
                                }
                                placeholder={t("roleMappingExpressionPlaceholder")}
                            />
                            <FormDescription>
                                Expression must evaluate to a string or string
                                array.
                            </FormDescription>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function BuilderRuleRow({
    rule,
    roleOptions,
    onChange,
    onRemove
}: {
    rule: MappingBuilderRule;
    roleOptions: Tag[];
    onChange: (rule: MappingBuilderRule) => void;
    onRemove: () => void;
}) {
    const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null);

    return (
        <div className="grid gap-3 rounded-md border p-3 md:grid-cols-[minmax(220px,1fr)_minmax(340px,2fr)_auto] md:items-start">
            <div className="space-y-1">
                <FormLabel className="text-xs md:hidden">Match value</FormLabel>
                <Input
                    value={rule.matchValue}
                    onChange={(e) =>
                        onChange({
                            ...rule,
                            matchValue: e.target.value
                        })
                    }
                    placeholder="Match value (for example: admin)"
                />
            </div>
            <div className="space-y-1 min-w-0">
                <FormLabel className="text-xs md:hidden">Assign roles</FormLabel>
                <TagInput
                    tags={rule.roleNames.map((name) => ({ id: name, text: name }))}
                    setTags={(nextTags) => {
                        const next =
                            typeof nextTags === "function"
                                ? nextTags(
                                      rule.roleNames.map((name) => ({
                                          id: name,
                                          text: name
                                      }))
                                  )
                                : nextTags;
                        onChange({
                            ...rule,
                            roleNames: [...new Set(next.map((tag) => tag.text))]
                        });
                    }}
                    activeTagIndex={activeTagIndex}
                    setActiveTagIndex={setActiveTagIndex}
                    placeholder="Assign roles"
                    enableAutocomplete={true}
                    autocompleteOptions={roleOptions}
                    restrictTagsToAutocompleteOptions={true}
                    allowDuplicates={false}
                    sortTags={true}
                    size="sm"
                />
            </div>
            <div className="flex justify-end md:justify-start">
                <Button type="button" variant="ghost" onClick={onRemove}>
                    Remove
                </Button>
            </div>
        </div>
    );
}
