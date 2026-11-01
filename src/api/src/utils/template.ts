export interface TemplateMarkerValidation {
  valid: boolean;
  regions: string[];
  error?: string;
}

export function validateTemplateMarkers(source: string): TemplateMarkerValidation {
  if (!source || typeof source !== 'string') {
    return { valid: false, regions: [], error: 'Template code is required' };
  }

  // Find all markers in order: // STUDENT_BEGIN <name> and // STUDENT_END
  const markerRegex = /\/\/\s*STUDENT_(BEGIN|END)(?:\s+([A-Za-z0-9_]+))?/g;
  let match: RegExpExecArray | null;
  const regions: string[] = [];
  const openStack: string[] = [];

  while ((match = markerRegex.exec(source)) !== null) {
    const type = match[1]; // BEGIN or END
    const name = match[2];

    if (type === 'BEGIN') {
      if (!name) {
        return { valid: false, regions: [], error: 'STUDENT_BEGIN requires a region name' };
      }
      if (openStack.length > 0) {
        return {
          valid: false,
          regions: [],
          error: `Nested STUDENT_BEGIN marker found inside region '${openStack[openStack.length - 1]}'`,
        };
      }
      openStack.push(name);
      regions.push(name);
    } else if (type === 'END') {
      if (openStack.length === 0) {
        return {
          valid: false,
          regions: [],
          error: 'Unexpected STUDENT_END marker without matching STUDENT_BEGIN',
        };
      }
      openStack.pop();
    }
  }

  if (openStack.length > 0) {
    return {
      valid: false,
      regions: [],
      error: `Unclosed STUDENT_BEGIN marker for region '${openStack[openStack.length - 1]}'`,
    };
  }

  if (regions.length === 0) {
    return {
      valid: false,
      regions: [],
      error: 'Template must contain at least one // STUDENT_BEGIN <region> and // STUDENT_END pair',
    };
  }

  const set = new Set(regions);
  if (set.size !== regions.length) {
    return { valid: false, regions: [], error: 'Duplicate region names in template' };
  }

  return { valid: true, regions };
}
