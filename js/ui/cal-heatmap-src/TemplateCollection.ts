import castArray from 'lodash-es/castArray';

import DefaultTemplates from './templates/index';
import type Options from './options/Options';
import type { Template, TemplateResult } from './index';
import type DateHelper from './helpers/DateHelper';

export default class TemplateCollection {
    dateHelper: DateHelper;

    options: Options;

    settings: Map<string, TemplateResult>;

    // Whether the default templates has been initiated
    initiated: boolean;

    constructor(dateHelper: DateHelper, options: Options) {
        this.settings = new Map();
        this.dateHelper = dateHelper;
        this.options = options;
        this.initiated = false;
    }

    get(subDomainType: string): TemplateResult {
        return this.settings.get(subDomainType)!;
    }

    has(subDomainType: string): boolean {
        return this.settings.has(subDomainType);
    }

    init() {
        if (!this.initiated) {
            this.initiated = true;
            this.add(DefaultTemplates);
        }
    }

    add(templates: Template | Template[]) {
        this.init();

        const tplWithParent: string[] = [];
        const templatesArray = castArray(templates);
        for (let i = 0; i < templatesArray.length; i++) {
            const f = templatesArray[i];
            const template = f(this.dateHelper, this.options.options);
            this.settings.set(template.name, template);

            if (template.hasOwnProperty('parent')) {
                tplWithParent.push(template.name);
            }
        }

        for (let i = 0; i < tplWithParent.length; i++) {
            const name = tplWithParent[i];
            const parentTemplate = this.settings.get(this.settings.get(name)!.parent!);

            if (!parentTemplate) {
                continue;
            }

            this.settings.set(name, {
                ...parentTemplate,
                ...this.settings.get(name),
            });
        }
    }
}
