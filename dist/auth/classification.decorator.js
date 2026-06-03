"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequiredClassification = exports.CLASSIFICATION_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.CLASSIFICATION_KEY = 'securityClassification';
const RequiredClassification = (level) => (0, common_1.SetMetadata)(exports.CLASSIFICATION_KEY, level);
exports.RequiredClassification = RequiredClassification;
//# sourceMappingURL=classification.decorator.js.map