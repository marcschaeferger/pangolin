import { orgQueries } from "@app/lib/queries";
import type { ListClientsResponse } from "@server/routers/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useDebounce } from "use-debounce";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "./ui/command";
import { cn } from "@app/lib/cn";

import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";

export type SelectedMachine = Pick<
    ListClientsResponse["clients"][number],
    "name" | "clientId"
>;

export type MachineSelectorProps = {
    orgId: string;
    selectedMachines?: SelectedMachine[];
    onSelectMachines: (machine: SelectedMachine[]) => void;
};

export function MachineSelector({
    orgId,
    selectedMachines = [],
    onSelectMachines
}: MachineSelectorProps) {
    const t = useTranslations();
    const [machineSearchQuery, setMachineSearchQuery] = useState("");

    const [debouncedValue] = useDebounce(machineSearchQuery, 150);

    const { data: machines = [] } = useQuery(
        orgQueries.machineClients({ orgId, perPage: 10, query: debouncedValue })
    );

    // always include the selected site in the list of sites shown
    const machinesShown = useMemo(() => {
        const allMachines: Array<SelectedMachine> = [...machines];
        for (const machine of selectedMachines) {
            if (
                !allMachines.find(
                    (machine) => machine.clientId === machine.clientId
                )
            ) {
                allMachines.unshift(machine);
            }
        }

        return allMachines;
    }, [machines, selectedMachines]);

    const selectedMachinesIds = new Set(
        selectedMachines.map((m) => m.clientId)
    );

    return (
        <Command shouldFilter={false}>
            <CommandInput
                placeholder={t("machineSearch")}
                value={machineSearchQuery}
                onValueChange={setMachineSearchQuery}
            />
            <CommandList>
                <CommandEmpty>{t("machineNotFound")}</CommandEmpty>
                <CommandGroup>
                    {machinesShown.map((m) => (
                        <CommandItem
                            value={`${m.name}:${m.clientId}`}
                            key={m.clientId}
                            onSelect={() => {
                                let newMachineClients = [];
                                if (selectedMachinesIds.has(m.clientId)) {
                                    newMachineClients = selectedMachines.filter(
                                        (mc) => mc.clientId !== m.clientId
                                    );
                                } else {
                                    newMachineClients = [
                                        ...selectedMachines,
                                        m
                                    ];
                                }
                                onSelectMachines(newMachineClients);
                            }}
                        >
                            <CheckIcon
                                className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedMachinesIds.has(m.clientId)
                                        ? "opacity-100"
                                        : "opacity-0"
                                )}
                            />
                            {`${m.name}`}
                        </CommandItem>
                    ))}
                </CommandGroup>
            </CommandList>
        </Command>
    );
}
