// =====================
// File: src/shared/i18n/messages/en.ts
// Purpose:
// - English UI messages
// - Preserves the full dictionary structure
// - Uses clearer, less technical wording
// =====================

import type { MessagesDictionary } from '../types';

export const enMessages: MessagesDictionary = {
    common: {
        pleaseWait: 'Please wait…',
        notAvailable: '—',
        unknown: 'Unknown',
        active: 'Active',
        inactive: 'Inactive',
        collapse: 'Collapse',
        expandMore: 'Show more',
        close: 'Close',
    },

    dashboard: {
        title: 'System overview',
        subtitle: 'Sites, cameras, and incidents.',

        loading: {
            title: 'Loading overview',
            subtitle: 'Collecting data for sites, cameras, and incidents.',
        },

        empty: {
            title: 'Nothing to show yet',
            subtitle: 'The overview will appear here when data is available.',
        },

        partial: {
            title: 'Some data is unavailable',
            subtitle: 'Showing the data that has already loaded.',
        },

        sections: {
            kpi: {
                title: 'Current status',
                subtitle: 'Key figures at a glance.',
            },

            sites: {
                title: 'Site status',
                subtitle: 'Sites that currently need attention.',
                empty: 'No sites found yet.',
                help: {
                    buttonAriaLabel: 'Open help for the sites section',
                    closeLabel: 'Close',
                    title: 'How to read a site card',
                    description:
                        'A site card shows the current site status, camera health, and incident count for the selected period.',
                    items: {
                        periodTitle: 'Period',
                        periodDescription:
                            'This period is shared by all incident counters in the section. If 30 days are selected, every incident value is shown for those same 30 days.',
                        nameTitle: 'Site name',
                        nameDescription:
                            'The header shows the site code and site name. The code helps quickly find the site in lists, reports, and diagrams.',
                        contextTitle: 'City and timezone',
                        contextDescription:
                            'The card shows the site city and timezone so local event times and camera signals are easier to interpret.',
                        modeTitle: 'Site mode',
                        modeDescription:
                            'This shows whether the site is active, under maintenance, inactive, or archived. It describes the operating mode of the site, not monitoring quality.',
                        healthTitle: 'Site health',
                        healthDescription:
                            'This shows the overall monitoring health of the site. It depends on camera availability and the number of cameras with issues.',
                        camerasOnlineTitle: 'Cameras online',
                        camerasOnlineDescription:
                            'Shows how many site cameras are currently reachable and sending data, out of the total number of connected cameras.',
                        camerasProblemTitle: 'Cameras with issues',
                        camerasProblemDescription:
                            'Shows how many cameras need attention because they are offline, unstable, or have not sent data for a long time.',
                        incidentsTitle: 'Incidents',
                        incidentsDescription:
                            'Shows how many incidents were recorded on this site during the selected period.',
                    },
                },
            },

            cameras: {
                title: 'Cameras by site',
                actions: {
                    createSite: 'Create site',
                },
                subtitle:
                    'Site summaries with online cameras, cameras that need attention, and expandable camera lists.',
                empty: 'No cameras found yet.',
                help: {
                    buttonAriaLabel: 'Open help for the cameras section',
                    closeLabel: 'Close',
                    title: 'How to read the camera section',
                    description:
                        'The period in the section header is shared by all incident counters here. Each site has a short summary, and each camera list can be expanded or collapsed separately.',
                    items: {
                        periodTitle: 'Period',
                        periodDescription:
                            'One shared period for all incident counters in this section, both for the whole site and for each camera.',
                        onlineTitle: 'Online',
                        onlineDescription:
                            'Shows how many cameras on the site are currently reachable out of the total number of site cameras.',
                        attentionTitle: 'Needs attention',
                        attentionDescription:
                            'Shows how many cameras on the site currently have connection, status, or diagnostic issues.',
                        siteIncidentsTitle: 'Site incidents',
                        siteIncidentsDescription:
                            'Shows how many incidents were recorded on the whole site during the selected period.',
                        cameraStateTitle: 'Camera state',
                        cameraStateDescription:
                            'The main state of the camera: operating normally, inactive, or needs attention.',
                        reasonTitle: 'Reason',
                        reasonDescription:
                            'A short explanation of why the camera appears in the list and what should be checked.',
                        statusTitle: 'Camera status',
                        statusDescription:
                            'The current operating status reported by the system.',
                        diagnosticsTitle: 'Diagnostics',
                        diagnosticsDescription:
                            'A short technical summary of the camera condition.',
                        signalTitle: 'Last signal',
                        signalDescription:
                            'Shows when the camera last sent data.',
                    },
                },
            },

            incidents: {
                title: 'Incidents',
                subtitle: 'Incident chart for the selected period.',
                chartEmpty: 'No incidents during the selected period.',
                chartAxisX: 'Dates',
                chartAxisY: 'Incident count',
                period: {
                    title: 'Period',
                    from: 'From',
                    to: 'To',
                    apply: 'Apply',
                    last7Days: '7 days',
                    last30Days: '30 days',
                },
            },
        },

        kpi: {
            sites: {
                title: 'Sites',
                meta: 'Operating: {{operational}} · Need attention: {{attention}}',
            },
            cameras: {
                title: 'Cameras',
                meta: 'Online: {{online}} · Need attention: {{attention}}',
            },
            incidents: {
                title: 'Incidents',
                meta: 'Last {{trendDays}} d.: {{recent}} · Critical: {{critical}}',
            },
        },

        labels: {
            sectionPeriodDays: 'Period: {{days}} d.',

            siteContext: 'City: {{city}} · Timezone: {{timezone}}',
            siteContextFallback: 'Context: {{value}}',
            siteHealthPill: 'Health: {{value}}',

            siteCamerasOnline: 'Cameras online: {{online}} of {{total}}',
            siteAttentionCameras: 'Cameras with issues: {{value}}',
            siteIncidentsCount: 'Incidents: {{value}}',

            siteCamerasOnlineDetailed: 'Online: {{online}} of {{total}}',
            siteAttentionCamerasDetailed: 'Need attention: {{value}}',
            cameraGroupIncidentsDetailed: 'Incidents: {{value}}',
            cameraGroupDisplayedCameras: 'Shown cameras: {{value}}',

            cameraGroupIncidentsCount: 'Site incidents: {{value}}',
            cameraIncidentsCount: 'Camera incidents: {{value}}',
            cameraLastSeen: 'Last camera signal: {{value}}',
            cameraLastSeenStale: 'Signal is stale: {{value}}',

            cameraGroupExpand: 'Show cameras',
            cameraGroupCollapse: 'Hide cameras',

            cameraStateInactive: 'Inactive',
            cameraStateStable: 'Operating normally',
            cameraStateCheckRequired: 'Needs attention',

            cameraReasonInactive:
                'The camera is not part of active monitoring.',
            cameraReasonOffline: 'No connection to the camera.',
            cameraReasonCriticalHealth:
                'Diagnostics show a critical condition.',
            cameraReasonStale:
                'The camera has not sent data for a long time.',
            cameraReasonWarningHealth:
                'There are signs of unstable operation.',
            cameraReasonUnknownHealth:
                'There is not enough data. The camera should be checked.',
            cameraReasonStable:
                'Connection and diagnostics show no obvious issues.',

            cameraStatusMetric: 'Camera status: {{value}}',
            cameraDiagnosticStatusMetric: 'Diagnostics: {{value}}',
            cameraLastSignalMetric: 'Last signal: {{value}}',
            cameraLastSignalMetricStale: 'No signal since: {{value}}',
            cameraIncidentsDetailed: 'Incidents: {{value}}',

            incidentSeverity: 'Severity: {{value}}',
            incidentType: 'Type: {{value}}',

            incidentsSummary: 'Total incidents: {{total}} · Critical: {{critical}}',
            windowDays: 'Period: {{days}} d. · Chart: {{trendDays}} d.',

            mediaAvailable: 'Media available',
            siteCameraPair: '{{site}} · {{camera}}',

            camerasOnline: 'Online: {{online}} of {{total}}',
            camerasAttention: 'Need attention: {{value}}',
            incidentsRecent: 'For period: {{value}}',
            lastSeen: 'Last seen: {{value}}',
            lastSeenStale: 'Stale signal: {{value}}',
        },
    },

    camera: {
        status: {
            online: 'Online',
            offline: 'Offline',
            problematic: 'Needs attention',
            degraded: 'Unstable',
            initializing: 'Initializing',
            unknown: 'Unknown',
        },

        healthBadge: {
            healthy: 'Normal',
            warning: 'Warning',
            critical: 'Critical',
            unknown: 'Unknown',
        },

        healthReason: {
            noSignal: 'No signal',
            noFrames: 'No frames received',
            streamUnavailable: 'Stream unavailable',
            highLatency: 'High latency',
            authFailed: 'Authorization failed',
            detectorUnavailable: 'Detector unavailable',
            initializing: 'Initializing',
            unknown: 'Unknown reason',
        },

        details: {
            title: 'Camera details',
            loading: 'Loading camera data…',

            empty: {
                title: 'Camera not found',
                subtitle:
                    'The requested camera does not exist or is currently unavailable.',
            },

            error: {
                title: 'Failed to load camera',
                subtitle: 'Try refreshing the page or repeating the request.',
            },

            header: {
                primary: {
                    online: 'Camera is operating normally',
                    problematic: 'Camera needs attention',
                    offline: 'Camera is unavailable',
                    unknown: 'Camera status is unknown',
                },
                summary: {
                    streamUnavailable: 'The stream is unavailable and the camera should be checked.',
                    highLatency: 'The camera is online, but the stream has high latency.',
                    problemDetectedPrefix: 'The camera is online, but needs attention:',
                    unstable: 'The camera is operating unstably.',
                    operational: 'The stream is available and the camera is operating normally.',
                },
            },

            actions: {
                back: 'Back',
                refresh: 'Refresh',
                retry: 'Retry',
                save: 'Save',
                saving: 'Saving…',
                reset: 'Reset',
                showSettings: 'Settings',
                hideSettings: 'Hide settings',
                closeSettings: 'Close settings',
                delete: 'Delete camera',
                deleting: 'Deleting…',
                deleteConfirm: 'Delete this camera?',
            },

            refresh: {
                pending: 'Refreshing…',
                updated: 'Data updated',
                unchanged: 'No changes. The data is already up to date.',
                failed: 'Failed to refresh data',
            },

            save: {
                error: 'Failed to save camera changes.',
            },

            delete: {
                error: 'Failed to delete camera.',
            },

            sections: {
                monitoring: {
                    title: 'Key indicators',
                    subtitle:
                        'Main camera metrics without repeated values.',
                },
                video: {
                    title: 'Video',
                    subtitle: 'Live stream, AI overlay, and archived segments.',
                },
                metadata: {
                    title: 'Metadata',
                    subtitle:
                        'Camera identifiers and main timestamps.',
                },
                health: {
                    title: 'Camera health',
                    subtitle:
                        'State summary, issue reason, and key metrics.',
                },
                realtime: {
                    title: 'Recent events',
                    subtitle:
                        'Camera events and important updates.',
                },
                settings: {
                    title: 'Quick settings',
                    subtitle:
                        'Main camera settings in one place.',
                },
            },

            summary: {
                primaryStatus: 'Main status',
                status: 'System status',
                activity: 'Activity',
                lastSeenAt: 'Last signal',
            },

            meta: {
                id: 'Camera ID',
                site: 'Site',
                location: 'Location',
                model: 'Model',
                serialNumber: 'Serial number',
                createdAt: 'Created at',
                updatedAt: 'Updated at',
            },

            health: {
                overall: 'Camera health',
                backendStatus: 'System status',
                reason: 'Reason',
                updatedAt: 'Updated',
                uptimeRatio: 'Time online',
                avgLatencyMs: 'Average latency',
                recentIncidentCount: 'Recent incidents',

                level: {
                    ok: 'Normal',
                    warning: 'Warning',
                    critical: 'Critical',
                    unknown: 'Unknown',
                },
            },

            form: {
                fields: {
                    siteId: 'Site',
                    name: 'Camera name',
                    isActive: 'Included in monitoring',
                },
                validation: {
                    siteIdRequired: 'Camera site is missing.',
                    nameRequired: 'Enter the camera name.',
                },
            },

            video: {
                empty: 'Video is currently unavailable.',

                incidents: {
                    title: 'Related incidents',
                    subtitle: 'Recent incidents for this camera with quick access to details.',
                },

                archive: {
                    title: 'Archive',
                    subtitle: 'Recent recordings and segments for the selected camera.',
                    empty: 'Archive segments are not available yet.',
                    incidentCount: '{{count}} events',
                    eventsLabel: 'events',
                },

                mode: {
                    raw: 'Original',
                    annotated: 'AI overlay',
                    original: 'Original',
                    processed: 'Processed',
                    current: 'Current mode',
                },

                processed: {
                    status: 'Processed stream',
                    available: 'Available',
                    unavailable: 'Unavailable',
                },

                actions: {
                    refresh: 'Refresh',
                    openSegment: 'Open recording',
                },

                meta: {
                    startedAt: 'Started at',
                    expiresAt: 'Available until',
                    aiModelVersion: 'AI model',
                    latency: 'Latency',
                },

                badges: {
                    aiOverlay: 'AI overlay available',
                },

                stream: {
                    status: 'Stream status',
                    available: 'Stream available',
                    unavailable: 'Stream unavailable',
                    unavailableHint:
                        'Check stream availability or try refreshing the camera data.',
                },

                overlay: {
                    status: 'AI overlay',
                    available: 'Available',
                    unavailable: 'Unavailable',
                },
            },

            realtime: {
                empty: 'No camera events yet.',

                title: {
                    online: 'Camera is operating normally again',
                    offline: 'Camera is unavailable',
                    degraded: 'Camera is operating unstably',
                    updated: 'Camera data updated',
                },

                message: {
                    online: 'The stream is available again and the camera is operating normally.',
                    offline: 'The stream is unavailable and the signal is lost.',
                    degraded: 'A camera issue has been detected.',
                    updated: 'Camera settings were updated.',
                },
            },
        },

        workspace: {
            title: 'Cameras',
            subtitle:
                'Filter cameras, check their current status, and open a camera card.',

            loading: 'Loading cameras…',

            empty: {
                title: 'No cameras found',
                subtitle: 'Adjust filters or try again later.',
            },

            error: {
                title: 'Failed to load cameras',
                subtitle: 'Try reopening the camera page.',
            },

            sections: {
                filters: {
                    title: 'Filters',
                    subtitle:
                        'Narrow the camera list by site, status, and health.',
                },
                bulk: {
                    title: 'Bulk actions',
                    subtitle:
                        'Apply changes to selected cameras.',
                },
                health: {
                    title: 'Current summary',
                    subtitle:
                        'Quick counters for the current page and filter result.',
                },
                realtime: {
                    title: 'Live updates',
                    subtitle:
                        'Recent camera updates from the live stream.',
                },
                table: {
                    title: 'Camera list',
                    subtitle:
                        'Browse matching cameras and open details.',
                },
            },

            actions: {
                applyFilters: 'Apply filters',
                resetFilters: 'Reset filters',
                restoreFilters: 'Restore applied',
            },

            filters: {
                presets: {
                    all: 'All',
                    offline: 'Offline',
                    problematic: 'Needs attention',
                },

                lastAppliedAt: 'Last applied',

                fields: {
                    siteId: 'Site',
                    search: 'Search',
                    isActive: 'Activity',
                    statuses: 'Statuses',
                    healthStatuses: 'Health states',
                },

                searchPlaceholder: 'Search by camera name or ID',

                siteSearch: {
                    placeholder: 'Find site by name',
                    loading: 'Loading sites…',
                    empty: 'No matching sites found.',
                    selected: 'Selected site: {{site}}',
                    clear: 'Clear site',
                    optionsLabel: 'Matching sites',
                    optionsPlaceholder: 'Choose a site from the list',
                },

                activity: {
                    any: 'Any',
                    active: 'Active',
                    inactive: 'Inactive',
                },
            },

            bulk: {
                selectedCount: 'Selected',
                empty: 'Select at least one camera to apply changes.',
                error: 'Failed to apply bulk changes.',
                applying: 'Applying…',
                apply: 'Apply changes',
                clearSelection: 'Clear selection',
                hint: 'Choose at least one field to update.',

                fields: {
                    siteId: 'New site ID',
                    name: 'New camera name',
                    isActive: 'Activity',
                },

                activity: {
                    noop: 'Do not change',
                    active: 'Set active',
                    inactive: 'Set inactive',
                },
            },

            health: {
                matching: 'Matching',
                onPage: 'On page',
                active: 'Active',
                online: 'Online',
                problematic: 'Needs attention',
                offline: 'Offline',
                stale: 'Stale signal',
                selected: 'Selected',
            },

            realtime: {
                lastSync: 'Last sync',
                empty: 'No recent camera updates.',
            },

            table: {
                visibleColumns: 'Visible columns',
                total: 'Total',
                pageSize: 'Page size',
                empty: 'No cameras found.',
                actions: 'Actions',
                open: 'Open',
                delete: 'Delete',
                deleting: 'Deleting…',
                deleteConfirm: 'Delete this camera?',
                deleteError: 'Failed to delete camera.',
                page: 'Page',
                previous: 'Previous',
                next: 'Next',

                columns: {
                    name: 'Camera',
                    site: 'Site',
                    location: 'Location',
                    isActive: 'Activity',
                    status: 'System status',
                    healthStatus: 'Health',
                    lastSeenAt: 'Last signal',
                },
            },
        },
    },

    site: {
        status: {
            active: 'Active',
            inactive: 'Inactive',
            maintenance: 'Maintenance',
            archived: 'Archived',
        },

        health: {
            normal: 'Normal',
            warning: 'Warning',
            critical: 'Critical',
            unknown: 'Unknown',
        },

        workspace: {
            title: 'Sites',
            subtitle:
                'Filter sites, manage the list, and open site cards.',
            loading: 'Loading sites…',

            empty: {
                title: 'No sites found',
                subtitle: 'Try changing filters or create a new site.',
            },

            error: {
                title: 'Failed to load sites',
                subtitle: 'Try refreshing the list or come back later.',
            },

            sections: {
                filters: {
                    title: 'Filters',
                    subtitle: 'Narrow the site list by the main attributes.',
                },
                bulk: {
                    title: 'Bulk actions',
                    subtitle: 'Apply changes to multiple sites at once.',
                },
                table: {
                    title: 'Site list',
                    subtitle: 'Browse matching sites and open the one you need.',
                },
            },

            actions: {
                create: 'Create site',
            },

            filters: {
                fields: {
                    search: 'Search',
                    isActive: 'Activity',
                    regions: 'Regions',
                },

                searchPlaceholder: 'Search by site name or code',

                activity: {
                    any: 'Any',
                    active: 'Active',
                    inactive: 'Inactive',
                },

                regionEmpty: 'Regions will appear after the site list is loaded.',

                actions: {
                    apply: 'Apply filters',
                    reset: 'Reset',
                },
            },

            bulk: {
                selectedCount: 'Selected sites',
                error: 'Failed to apply bulk changes.',
                applying: 'Applying…',
                apply: 'Apply changes',
                clearSelection: 'Clear selection',
                hint: 'Select sites and choose at least one field to update.',

                fields: {
                    region: 'Region',
                    isActive: 'Activity',
                },

                activity: {
                    noop: 'Do not change',
                    active: 'Set active',
                    inactive: 'Set inactive',
                },
            },

            table: {
                visibleColumns: 'Visible columns',
                total: 'Total',
                pageSize: 'Page size',
                empty: 'Nothing matches the current filters.',
                actions: 'Actions',
                open: 'Open',
                page: 'Page',
                previous: 'Previous',
                next: 'Next',

                columns: {
                    name: 'Site',
                    code: 'Code',
                    region: 'Region',
                    isActive: 'Activity',
                },
            },
        },

        details: {
            title: 'Site',
            subtitle: 'Site card and main details.',
            loading: 'Loading site data…',
            loadingRelated: 'Loading site and cameras…',

            empty: {
                title: 'Site not found',
                subtitle: 'Check the selected site and try opening it again.',
            },

            error: {
                title: 'Failed to load site',
                subtitle: 'Try refreshing the page or open the card later.',
            },

            sections: {
                overview: {
                    title: 'Main details',
                    subtitle: 'A short summary of the site.',
                },
                meta: {
                    title: 'Additional info',
                    subtitle: 'Service, contact, and reference information.',
                },
                summary: {
                    title: 'Camera summary',
                    subtitle: 'A short summary of camera status on this site.',
                },
                address: {
                    title: 'Address',
                    subtitle: 'Structured address data for the site.',
                },
                contact: {
                    title: 'Contact',
                    subtitle: 'Main contact details for the site.',
                },
                cameras: {
                    title: 'Site cameras',
                    subtitle: 'Cameras that need attention are shown first.',

                    empty: 'There are no cameras on this site yet.',

                    state: {
                        offline: 'Offline',
                        problem: 'Needs attention',
                        initializing: 'Initializing',
                        unknown: 'Unknown',
                        stale: 'No recent signal',
                        normal: 'Normal',
                    },

                    reason: {
                        noSignal: 'No signal from the camera.',
                        noFrames: 'Frames are not being received.',
                        streamUnavailable: 'The video stream is unavailable.',
                        authFailed: 'Camera authorization failed.',
                        highLatency: 'The video stream has high latency.',
                        detectorUnavailable: 'The analytics module is unavailable.',
                        initializing: 'The camera is still initializing.',
                        unknown: 'The reason for the current state is unknown.',
                        offline: 'The camera is unavailable.',
                        problem: 'The camera should be checked based on its current state.',
                        stale: 'The last signal was received a long time ago.',
                        normal: 'The camera is operating normally.',
                    },

                    diagnostics: {
                        normal: 'Normal',
                    },

                    labels: {
                        status: 'Status: {{value}}',
                        lastSeen: 'Last signal: {{value}}',
                        diagnostics: 'Diagnostics: {{value}}',
                        incidents: 'Incidents: {{value}}',
                    },
                },
            },

            fields: {
                name: 'Name',
                code: 'Code',
                region: 'Region',
                isActive: 'Activity',
                address: 'Address',
                contact: 'Contact',
                tags: 'Tags',
                createdAt: 'Created at',
                updatedAt: 'Updated at',
                country: 'Country',
                city: 'City',
                addressLine1: 'Address',
                postalCode: 'Postal code',
                contactName: 'Name',
                contactEmail: 'Email',
                contactPhone: 'Phone',
                contactPosition: 'Position',
            },

            summary: {
                total: 'Total cameras',
                online: 'Online',
                problematic: 'Problematic',
                offline: 'Offline',
                incidents: 'Incidents',
            },

            actions: {
                edit: 'Edit',
                close: 'Close',
                back: 'Back',
                delete: 'Delete site',
                deleting: 'Deleting…',
                deleteConfirm: 'Delete this site?',
            },

            delete: {
                blocked: 'The site cannot be deleted while cameras are still assigned to it.',
                failed: 'Failed to delete the site.',
            },

            cameras: {
                empty: 'There are no cameras on this site yet.',
            },
        },

        create: {
            summary: {
                eyebrow: 'New site',
                title: 'Site created',
                subtitle:
                    'You can add cameras right away if needed. This step is optional.',
                fields: {
                    site: 'Site',
                    code: 'Code',
                    region: 'Region',
                    address: 'Address',
                    cameras: 'Added cameras',
                },
                hintWithoutCameras:
                    'You can finish now or skip the camera step.',
                hintWithCameras:
                    'Cameras have already been added. Review the list and finish the setup.',
            },

            actions: {
                finish: 'Finish setup',
                skipCameras: 'Skip camera step',
            },

            cameras: {
                eyebrow: 'Step 2',
                title: 'Cameras for the new site',
                subtitle:
                    'Enter the main camera details and connection settings. The system checks the connection first, then allows you to save the camera.',
                total: 'Added cameras: {{count}}',
                totalLabel: 'Cameras',

                composer: {
                    title: 'Add camera',
                    subtitle:
                        'Fill in the camera details and stream connection, then run the check.',
                },

                list: {
                    title: 'Added cameras',
                    subtitle:
                        'After saving, the camera will appear in this list.',
                },

                siteRequired: 'Save the site first.',

                sections: {
                    identity: {
                        title: 'Main details',
                        description:
                            'Camera name and installation place.',
                    },
                    connection: {
                        title: 'Connection',
                        description:
                            'Access settings for the camera stream.',
                    },
                    overrides: {
                        title: 'Additional info',
                        description:
                            'Optional information about the camera.',
                    },
                },

                fields: {
                    name: 'Camera name',
                    location: 'Installation place',
                    host: 'IP address or host',
                    port: 'Port',
                    username: 'Username',
                    password: 'Password',
                    path: 'Stream address',
                    vendor: 'Vendor',
                    model: 'Model',
                    serialNumber: 'Serial number',
                },

                placeholders: {
                    name: 'For example, Entrance 1',
                    location: 'For example, loading zone',
                    host: 'For example, 192.168.1.120',
                    port: '554',
                    username: 'For example, admin',
                    password: 'Enter password',
                    path: '/Streaming/Channels/101',
                    vendor: 'For example, Hikvision',
                    model: 'For example, DS-2CD2143G2-I',
                    serialNumber: 'For example, SN-001',
                },

                actions: {
                    check: 'Check connection',
                    checking: 'Checking…',
                    recheck: 'Check again',
                    create: 'Save camera',
                    creating: 'Saving…',
                    reset: 'Reset',
                    delete: 'Delete',
                    deleting: 'Deleting…',

                    hint: {
                        recheck:
                            'The connection settings changed. Run the check again before saving.',
                        createReady:
                            'Connection confirmed. The camera can now be saved.',
                        checkRequired:
                            'Run the connection check before saving the camera.',
                    },
                },

                create: {
                    error: 'Failed to save camera.',
                    validation: {
                        siteIdRequired: 'Site is not defined.',
                        nameRequired: 'Enter the camera name.',
                        locationRequired: 'Enter the installation place.',
                        hostRequired: 'Enter the IP address or host.',
                        portRequired: 'Enter the port.',
                        usernameRequired: 'Enter the username.',
                        passwordRequired: 'Enter the password.',
                        pathRequired: 'Enter the stream address.',
                        connectTimeoutRequired: 'Fill in the required field.',
                        readTimeoutRequired: 'Fill in the required field.',
                        generic: 'Fill in the field.',

                        portInvalid: 'Enter a valid port number.',
                        connectTimeoutInvalid: 'Enter a valid number.',
                        readTimeoutInvalid: 'Enter a valid number.',
                        numberInvalid: 'Enter a valid number.',

                        portRange: 'Port must be between 1 and 65535.',
                        connectTimeoutRange: 'The value is out of range.',
                        readTimeoutRange: 'The value is out of range.',
                        rangeInvalid: 'The value is out of range.',
                    },
                },

                check: {
                    error: 'Failed to check the connection.',
                    status: 'Check result: {{value}}',
                    sourcePreview: 'Connection: {{value}}',
                    discoveredDevice: 'Detected device: {{value}}',
                    discoveredStream: 'Stream: {{value}}',
                    expiresAt: 'The check is valid until {{value}}',

                    diagnostics: {
                        responseTime: 'Response time: {{value}} ms',
                    },

                    state: {
                        recheckTitle: 'Run the check again',
                        verifiedTitle: 'Connection confirmed',
                        initialTitle: 'Check the connection',

                        recheckDescription:
                            'The connection settings were changed. Run the check again before saving.',
                        verifiedDescription:
                            'The check completed successfully. You can now save the camera.',
                        readyDescription:
                            'All required fields are filled in. You can run the check now.',
                        fillDescription:
                            'Fill in the main details and connection settings, then run the check.',
                    },
                },

                loading: 'Loading cameras…',
                loadError: 'Failed to load site cameras.',
                empty: 'No cameras have been added yet.',
                deleteConfirm: 'Delete this camera?',
                deleteError: 'Failed to delete camera.',
            },
        },

        edit: {
            title: 'Edit site',
            subtitle: 'Update the main site data in one form.',
            loading: 'Loading site data…',

            empty: {
                title: 'Site not found',
                subtitle: 'Select a site first to open the edit form.',
            },

            error: {
                title: 'Failed to open the form',
                subtitle: 'Try opening the site again or come back later.',
                submit: 'Failed to save site changes.',
            },

            section: {
                title: 'Site data',
                subtitle: 'Change only the fields that are really needed for the site card.',
            },

            fields: {
                name: 'Name',
                code: 'Code',
                region: 'Region',
                isActive: 'Active',
            },

            validation: {
                required: 'This field is required.',
            },

            actions: {
                save: 'Save',
                saving: 'Saving…',
                reset: 'Reset',
                cancel: 'Cancel',
            },

            hints: {
                pristine: 'Change one or more fields to save the site.',
            },

            cameras: {
                eyebrow: 'Cameras',
                title: 'Site cameras',
                subtitle:
                    'Enter the main camera details and connection settings. The system checks the connection first, then allows you to save the camera.',
                total: 'Total cameras: {{count}}',
                totalLabel: 'Cameras',

                composer: {
                    title: 'Add camera',
                    subtitle:
                        'Fill in the camera details and stream connection, then run the check.',
                },

                list: {
                    title: 'Current cameras',
                    subtitle:
                        'After saving, the new camera will appear in this list.',
                },

                siteRequired:
                    'A saved site is required first.',

                sections: {
                    identity: {
                        title: 'Main details',
                        description:
                            'Camera name and installation place.',
                    },
                    connection: {
                        title: 'Connection',
                        description:
                            'Access settings for the camera stream.',
                    },
                    overrides: {
                        title: 'Additional info',
                        description:
                            'Optional information about the camera.',
                    },
                },

                fields: {
                    name: 'Camera name',
                    location: 'Installation place',
                    host: 'IP address or host',
                    port: 'Port',
                    username: 'Username',
                    password: 'Password',
                    path: 'Stream address',
                    vendor: 'Vendor',
                    model: 'Model',
                    serialNumber: 'Serial number',
                },

                placeholders: {
                    name: 'For example, Entrance 1',
                    location: 'For example, loading zone',
                    host: 'For example, 192.168.1.120',
                    port: '554',
                    username: 'For example, admin',
                    password: 'Enter password',
                    path: '/Streaming/Channels/101',
                    vendor: 'For example, Hikvision',
                    model: 'For example, DS-2CD2143G2-I',
                    serialNumber: 'For example, SN-001',
                },

                actions: {
                    check: 'Check connection',
                    checking: 'Checking…',
                    recheck: 'Check again',
                    create: 'Save camera',
                    creating: 'Saving…',
                    reset: 'Reset',
                    delete: 'Delete',
                    deleting: 'Deleting…',

                    hint: {
                        recheck:
                            'The connection settings changed. Run the check again before saving.',
                        createReady:
                            'Connection confirmed. The camera can now be saved.',
                        checkRequired:
                            'Run the connection check before saving the camera.',
                    },
                },

                create: {
                    error: 'Failed to save camera.',
                    validation: {
                        siteIdRequired: 'Site is not defined.',
                        nameRequired: 'Enter the camera name.',
                        locationRequired: 'Enter the installation place.',
                        hostRequired: 'Enter the IP address or host.',
                        portRequired: 'Enter the port.',
                        usernameRequired: 'Enter the username.',
                        passwordRequired: 'Enter the password.',
                        pathRequired: 'Enter the stream address.',
                        connectTimeoutRequired: 'Fill in the required field.',
                        readTimeoutRequired: 'Fill in the required field.',
                        generic: 'Fill in the field.',

                        portInvalid: 'Enter a valid port number.',
                        connectTimeoutInvalid: 'Enter a valid number.',
                        readTimeoutInvalid: 'Enter a valid number.',
                        numberInvalid: 'Enter a valid number.',

                        portRange: 'Port must be between 1 and 65535.',
                        connectTimeoutRange: 'The value is out of range.',
                        readTimeoutRange: 'The value is out of range.',
                        rangeInvalid: 'The value is out of range.',
                    },
                },

                check: {
                    error: 'Failed to check the connection.',
                    status: 'Check result: {{value}}',
                    sourcePreview: 'Connection: {{value}}',
                    discoveredDevice: 'Detected device: {{value}}',
                    discoveredStream: 'Stream: {{value}}',
                    expiresAt: 'The check is valid until {{value}}',

                    diagnostics: {
                        responseTime: 'Response time: {{value}} ms',
                    },

                    state: {
                        recheckTitle: 'Run the check again',
                        verifiedTitle: 'Connection confirmed',
                        initialTitle: 'Check the connection',

                        recheckDescription:
                            'The connection settings were changed. Run the check again before saving.',
                        verifiedDescription:
                            'The check completed successfully. You can now save the camera.',
                        readyDescription:
                            'All required fields are filled in. You can run the check now.',
                        fillDescription:
                            'Fill in the main details and connection settings, then run the check.',
                    },
                },

                loading: 'Loading cameras…',
                loadError: 'Failed to load site cameras.',
                empty: 'There are no cameras on this site yet.',
                deleteConfirm: 'Delete this camera?',
                deleteError: 'Failed to delete camera.',
            },
        },

        form: {
            title: {
                create: 'Create site',
                edit: 'Edit site',
            },

            hero: {
                createEyebrow: 'New site',
                editEyebrow: 'Editing',
            },

            sectionEyebrow: {
                address: 'Address',
                contact: 'Contact',
            },

            subtitle: 'The address can only be selected from the official registry.',
            subtitleCompact: 'Site details: name, code, official address, and contact.',
            loading: 'Loading site…',

            loadError: {
                title: 'Failed to load site',
                subtitle: 'Try opening the form again later.',
            },

            sections: {
                general: {
                    title: 'Main details',
                    subtitle: 'Fill in the basic site data.',
                },
                address: {
                    title: 'Address',
                    subtitle: 'The address can only be selected from the official registry.',
                },
                contact: {
                    title: 'Contact',
                    subtitle: 'Provide at least one contact method: phone or email.',
                },
            },

            fields: {
                name: 'Site name',
                code: 'Code',
                isActive: 'Site status',
                addressQuery: 'Registry address search',
                contactName: 'Name',
                contactPosition: 'Position',
                contactEmail: 'Email',
                contactPhone: 'Phone',
            },

            placeholders: {
                name: 'For example, Omsk — Main production site',
                code: 'For example, OMSK-01',
                addressQuery: 'Start typing an address: city, street, building',
                contactName: 'Full name or short name',
                contactPosition: 'Choose from the list or enter manually',
                contactEmail: 'name@company.com',
                contactPhone: '+7 (___) ___-__-__',
            },

            status: {
                active: 'Active',
                inactive: 'Inactive',
            },

            contactPositionOptions: {
                siteManager: 'Site manager',
                siteAdministrator: 'Site administrator',
                shiftSupervisor: 'Shift supervisor',
                operator: 'Operator',
                engineer: 'Engineer',
                technician: 'Technician',
                securityOfficer: 'Security officer',
            },

            searchSelect: {
                toggleOptions: 'Show options for the “{{label}}” field',
                empty: 'No suggestions. You can enter a value manually.',
            },

            address: {
                hint: 'Select the exact building address from the registry.',
                lookupLoading: 'Searching addresses…',
                lookupError: 'Failed to load addresses from the registry.',
                empty: 'Nothing found. Refine the query and select an address from the registry.',
                selectedTitle: 'Selected address',
                clear: 'Clear',
                registryWarningTitle: 'The address is not linked to the registry yet',
                registryWarningCurrent: 'Current address: {{value}}',
                registryWarningBody: 'To change the address, select the official building address from the registry.',
                region: 'Region',
                cityOrSettlement: 'City / settlement',
                street: 'Street',
                house: 'Building',
                building: 'Block / structure',
                postalCode: 'Postal code',
                okato: 'OKATO',
                oktmo: 'OKTMO',
            },

            actions: {
                create: 'Create site',
                save: 'Save changes',
                saving: 'Saving…',
                reset: 'Reset',
                cancel: 'Cancel',
            },

            code: {
                help: 'You can edit the code manually or regenerate it from the site name.',
                compactHelp: 'Short site code. Example: OMSK-FAS-02.',
                regenerate: 'Regenerate code',
            },

            errors: {
                save: 'Failed to save site changes.',
            },

            validation: {
                required: 'This field is required.',
                nameRequired: 'Enter the site name.',
                nameInvalid: 'Enter a valid site name.',
                codeRequired: 'Enter the site code.',
                codeInvalid: 'Enter a valid site code.',
                registryRequired: 'Choose an address in the official registry.',
                contactNameRequired: 'Enter the contact name.',
                contactNameInvalid: 'Enter a valid contact name.',
                emailInvalid: 'Enter a valid email.',
                phoneInvalid: 'Enter a valid phone number.',
                contactMethodRequired: 'Provide at least one contact method: phone or email.',
            },
        },
    },

    incident: {
        severity: {
            info: 'Info',
            low: 'Low',
            medium: 'Medium',
            high: 'High',
            critical: 'Critical',
        },
        type: {
            missing_headgear: 'Missing headgear',
            wrong_headgear: 'Wrong headgear',
            multiple_persons: 'Multiple persons',
            occluded_head: 'Occluded head',
            uncertain: 'Uncertain',
            other: 'Other',
        },
        details: {
            title: 'Incident details',
            loading: 'Loading incident details…',
            empty: {
                title: 'Incident not found',
                subtitle:
                    'The requested incident does not exist or is currently unavailable.',
            },
            error: {
                title: 'Failed to load incident',
                subtitle: 'Try reloading the incident details.',
            },
            actions: {
                back: 'Back',
                refresh: 'Refresh',
                retry: 'Retry',
                open: 'Open',
            },
            sections: {
                overview: {
                    title: 'Overview',
                    subtitle: 'Main incident summary.',
                },
                metadata: {
                    title: 'Metadata',
                    subtitle: 'Main identifiers and timestamps.',
                },
                media: {
                    title: 'Frame and video clip',
                    subtitle: 'Saved frame with the incident and the related video clip.',
                },
            },
            labels: {
                tags: 'Tags',
                correlationIds: 'Related IDs',
            },
            summary: {
                severity: 'Severity',
                type: 'Type',
                confidence: 'Confidence',
                dataQuality: 'Data quality',
            },
            meta: {
                id: 'Incident ID',
                eventId: 'Event ID',
                site: 'Site',
                camera: 'Camera',
                eventTime: 'Event time',
                createdAt: 'Created at',
                updatedAt: 'Updated at',
                confidence: 'Confidence',
                dataQuality: 'Data quality',
            },
            media: {
                empty: 'Media is unavailable for this incident.',
                image: 'Open incident frame',
                video: 'Open video clip',
            },
        },
    },

    incidents: {
        workspace: {
            title: 'Incidents',
            subtitle:
                'Search, filter, review metrics, and open incident details.',

            common: {
                retry: 'Retry',
            },

            filters: {
                title: 'Filters',
                subtitle: 'Search and filter settings for incidents.',

                fields: {
                    search: {
                        label: 'Search',
                        help: 'Search by incident ID, event ID, site, or camera.',
                        placeholder: 'Search incidents',
                    },
                    siteIds: {
                        label: 'Site IDs',
                        help: 'Comma-separated list.',
                        placeholder: 'site-1, site-2',
                    },
                    cameraIds: {
                        label: 'Camera IDs',
                        help: 'Comma-separated list.',
                        placeholder: 'camera-1, camera-2',
                    },
                    tags: {
                        label: 'Tags',
                        help: 'Comma-separated list.',
                        placeholder: 'tag-1, tag-2',
                    },
                    from: {
                        label: 'From',
                        help: 'Start of the event time range.',
                    },
                    to: {
                        label: 'To',
                        help: 'End of the event time range.',
                    },
                    minConfidence: {
                        label: 'Min confidence',
                    },
                    maxConfidence: {
                        label: 'Max confidence',
                    },
                    severities: {
                        label: 'Severities',
                        empty: 'No severities available.',
                    },
                    types: {
                        label: 'Types',
                        empty: 'No types available.',
                    },
                    pageSize: {
                        label: 'Page size',
                        help: 'From {{min}} to {{max}}.',
                    },
                },

                actions: {
                    apply: 'Apply filters',
                    reset: 'Reset',
                },
            },

            metrics: {
                title: 'Metrics',
                subtitle: 'Summary counters for the current filters.',
                loading: 'Loading metrics…',
                error: 'Failed to load incident metrics.',
                empty: 'Metrics are unavailable.',

                cards: {
                    total: 'Total',
                    critical: 'Critical',
                    highSeverity: 'High + Critical',
                },

                topSites: {
                    title: 'Top sites',
                    empty: 'No site data.',
                },

                topCameras: {
                    title: 'Top cameras',
                    empty: 'No camera data.',
                },
            },

            table: {
                title: 'Incident list',
                subtitle: 'Open a row to view incident details.',
                loading: 'Loading incidents…',
                error: 'Failed to load incidents.',
                empty: 'No incidents found.',

                columns: {
                    eventTime: 'Event time',
                    site: 'Site',
                    camera: 'Camera',
                    severity: 'Severity',
                    type: 'Type',
                    confidence: 'Confidence',
                },

                pagination: {
                    summary: 'Total: {{total}} · Page {{currentPage}} of {{pageCount}}',
                    previous: 'Previous',
                    next: 'Next',
                },
            },
        },
    },

    errors: {
        network: 'Unable to connect to the server',
        actionFailed: 'Action failed',

        boundaryTitle: 'Something went wrong',
        boundarySubtitle: 'The application ran into an unexpected error.',
        boundaryDetails: 'Details',
        boundaryReload: 'Reload',

        notFoundTitle: 'Page not found',
        notFoundSubtitle: 'The link may be incorrect or the page was removed.',
        notFoundCode: 'Code: 404',
        back: 'Back',
        goHome: 'Home',

        httpTitle: 'Request error',
        httpDetails: 'Error details',
        show: 'Show',
        hide: 'Hide',
        retry: 'Retry',
        reset: 'Reset',

        titleNetwork: 'No connection',
        titleTimeout: 'Server timeout',
        titleTooManyRequests: 'Too many requests',
        titleUnauthorized: 'Authorization required',
        titleForbidden: 'Access denied',
        titleNotFound: 'Not found',
        titleBadRequest: 'Bad request',
        titleValidation: 'Invalid data',
        titleConflict: 'Conflict',
        titleServerError: 'Server error',

        hintCheckInternet: 'Check your connection and try again.',
        hintTryAgain: 'Please try again.',
        hintTryLater: 'Try again later.',
        hintEnterSystem: 'Sign in and try again.',
        hintNoRights: 'You don’t have permission to do this.',
        hintResourceNotFound: 'The resource was not found.',
        hintCheckFields: 'Check the entered values.',
        hintDataChanged: 'The data has changed. Refresh and try again.',
        hintTooManyRequests: 'Try again a little later.',
        hintRetryAfter: 'Try again later (Retry-After: {{retryAfter}}).',

        tech: {
            code: 'code',
            status: 'status',
            method: 'method',
            url: 'url',
            correlation: 'correlation',
            retryAfter: 'retry-after',
            message: 'message',
        },
    },

    settings: {
        title: 'Settings',
        subtitle:
            'Language and interface mode. Only supported settings are shown here.',

        general: {
            title: 'General',
            subtitle:
                'Basic interface settings that are already available in the app.',
        },

        fields: {
            languageLabel: 'Language',
            languageHelp: 'Changes the application language and saves it locally.',
            themeModeLabel: 'Interface mode',
            themeModeHelp:
                'Controls whether the interface uses light, dark, or system mode.',
        },

        actions: {
            reset: 'Reset interface settings',
        },

        locale: {
            ru: 'Русский',
            en: 'English',
        },

        themeMode: {
            light: 'Light',
            dark: 'Dark',
            system: 'Follow system',
        },
    },
};