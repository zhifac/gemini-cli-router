export function convertSchemaTypesToLowercase(schema) {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  if (Array.isArray(schema)) {
    return schema.map(item => convertSchemaTypesToLowercase(item));
  }

  const newSchema = { ...schema };

  if (typeof newSchema.type === 'string') {
    newSchema.type = newSchema.type.toLowerCase();
  }

  if (newSchema.properties) {
    const newProperties = {};
    for (const key in newSchema.properties) {
      newProperties[key] = convertSchemaTypesToLowercase(newSchema.properties[key]);
    }
    newSchema.properties = newProperties;
  }

  if (newSchema.items) {
    newSchema.items = convertSchemaTypesToLowercase(newSchema.items);
  }

  if (newSchema.parameters) {
      newSchema.parameters = convertSchemaTypesToLowercase(newSchema.parameters);
  }

  return newSchema;
}

export function isGeminiAPI(url) {
  return url.includes('generativelanguage.googleapis.com');
}