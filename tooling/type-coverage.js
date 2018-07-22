// loosly based on https://github.com/plantain-00/type-coverage

const path = require("path");
const fs = require("fs");
const mkdirp = require("mkdirp");
const ts = require("typescript");
const program = require("./typescript-program");

const typeChecker = program.getTypeChecker();

const projectPaths = [
	path.resolve(__dirname, "../lib"),
	path.resolve(__dirname, "../bin"),
	path.resolve(__dirname, "../tooling"),
	path.resolve(__dirname, "../declarations.d.ts")
];
const basePath = path.resolve(__dirname, "..");

const isProjectFile = file => {
	return projectPaths.some(p =>
		file.toLowerCase().startsWith(p.replace(/\\/g, "/").toLowerCase())
	);
};

const coverageReport = Object.create(null);

for (const sourceFile of program.getSourceFiles()) {
	let file = sourceFile.fileName;
	if (isProjectFile(file)) {
		const rep = {
			path: file,
			statementMap: {},
			fnMap: {},
			branchMap: {},
			s: {},
			f: {},
			b: {}
		};
		coverageReport[file] = rep;
		let statementIndex = 0;

		/**
		 * @param {ts.Node} node the node to be walked
		 * @returns {void}
		 */
		const walkNode = node => {
			if (ts.isIdentifier(node) || node.kind === ts.SyntaxKind.ThisKeyword) {
				const type = typeChecker.getTypeAtLocation(node);
				if (type) {
					const { line, character } = ts.getLineAndCharacterOfPosition(
						sourceFile,
						node.getStart()
					);
					const {
						line: lineEnd,
						character: characterEnd
					} = ts.getLineAndCharacterOfPosition(sourceFile, node.getEnd());
					const typeText = typeChecker.typeToString(type);
					let isExternal = false;

					/**
					 * @param {ts.Type} type the type to be checked
					 * @returns {void}
					 */
					const checkDecls = type => {
						if (!type.symbol) return;
						for (const decl of type.symbol.getDeclarations()) {
							const sourceFile = decl.getSourceFile();
							if (sourceFile && !isProjectFile(sourceFile.fileName))
								isExternal = true;
						}
					};
					if (node.parent && ts.isPropertyAccessExpression(node.parent)) {
						const expressionType = typeChecker.getTypeAtLocation(
							node.parent.expression
						);
						checkDecls(expressionType);
					}
					if (/^(<.*>)?\(/.test(typeText)) {
						checkDecls(type);
					}
					const isTyped =
						isExternal ||
						(!(type.flags & ts.TypeFlags.Any) && !/\bany\b/.test(typeText));
					rep.statementMap[statementIndex] = {
						start: {
							line: line + 1,
							column: character
						},
						end: {
							line: lineEnd + 1,
							column: characterEnd - 1
						}
					};
					rep.s[statementIndex] = isTyped ? 1 : 0;
					statementIndex++;
				}
			}
			node.forEachChild(walkNode);
		};
		sourceFile.forEachChild(walkNode);
	}
}

const outputDirectory = path.resolve(__dirname, "../coverage");
mkdirp.sync(outputDirectory);
fs.writeFileSync(
	path.resolve(outputDirectory, "coverage-types.json"),
	JSON.stringify(coverageReport),
	"utf-8"
);