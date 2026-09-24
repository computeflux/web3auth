const x = <div>hi</div> ; export default x ; hypa -c "EOF
cd /home/wetee/work/cathome/workflow/apps/minishop" && timeout 30 bun run ../web3auth/_testjsx.tsx 2>&1 | head -15 ; hypa -c "rm -f /home/wetee/work/cathome/workflow/apps/web3auth/_testjsx.tsx"
